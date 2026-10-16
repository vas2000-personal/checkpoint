import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {studyDay} from '../lib/server.js';
import {issueSession} from '../lib/sessions.js';
import {getBoard} from '../lib/board.js';
import {POST as signup} from '../app/api/signup/route.js';
import {POST as signin} from '../app/api/enter/route.js';
import {POST as settings} from '../app/api/settings/route.js';
const zone='America/New_York',today=studyDay(new Date(),zone),back=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)};
const SESSION='e'.repeat(64),SESSION_HASH=createHash('sha256').update(SESSION).digest('hex');
const env=()=>{process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key'};
// Every stub records what it was asked for, so a test can assert on the request as well as the reply.
const install=handler=>{env();const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{const u=new URL(url),table=u.pathname.split('/').at(-1);calls.push({table,method:options.method||'GET',query:u.searchParams,body:options.body?JSON.parse(options.body):null});
  return await handler(table,u,options)??Response.json([])};
 return {calls,restore(){globalThis.fetch=previous}};
};
const raw=(path,body,cookie)=>new Request('https://checkpoint.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body});
test('a JSON body that parses but is not an object is a 400, never a logged 502',async()=>{
 const quiet=console.error,logged=[];console.error=(...parts)=>logged.push(parts.join(' '));
 const {restore}=install(table=>{
  if(table==='checkpoint_sessions')return Response.json([{username:'gir'}]);
  if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun',time_zone:zone}]);
 });
 try{
  for(const body of ['null','[]','"gir"','7','{']){
   for(const [name,route] of [['enter',signin],['signup',signup]]){
    const response=await route(raw('/api/'+name,body));
    assert.equal(response.status,400,name+' '+body);
    assert.equal((await response.json()).error,'Please send a valid update.');
   }
   const changed=await settings(raw('/api/settings',body,'checkpoint_session='+SESSION));
   assert.equal(changed.status,400,'settings '+body);
  }
  assert.deepEqual(logged,[],'a client error must not look like a server failure in the log');
 }finally{restore();console.error=quiet}
});
test('rate limiting answers 429 with Retry-After, and a database without the migration does not limit',async()=>{
 let reply=()=>Response.json({allowed:false,retry_after:42});
 const {restore}=install(table=>table==='checkpoint_attempt'?reply():table==='checkpoint_users'?Response.json([{username:'gir',display_name:'Varun'}]):undefined);
 const quiet=console.error;console.error=()=>{};
 try{
  const limited=await signin(raw('/api/enter','{"username":"gir"}'));
  assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'42');
  assert.equal((await limited.json()).error,'Too many attempts. Please wait a moment and try again.');
  reply=()=>Response.json({code:'PGRST202'},{status:404});
  assert.equal((await signin(raw('/api/enter','{"username":"gir"}'))).status,200);
 }finally{restore();console.error=quiet}
});
test('a signup whose session insert fails removes the username it just created',async()=>{
 let sessionsFail=true;const users=[];
 const {calls,restore}=install((table,u,options)=>{
  if(table==='checkpoint_attempt')return Response.json({allowed:true,retry_after:60});
  if(table==='checkpoint_sessions')return sessionsFail?Response.json({message:'pool exhausted'},{status:503}):new Response(null,{status:201});
  if(table==='checkpoint_users'){
   if(options.method==='POST'){if(users.includes(JSON.parse(options.body).username))return Response.json({},{status:409});users.push(JSON.parse(options.body).username);return new Response(null,{status:201})}
   if(options.method==='DELETE'){const name=u.searchParams.get('username').slice(3);users.splice(users.indexOf(name),1);return new Response(null,{status:204})}
   return Response.json(users.map(username=>({username,display_name:username})));
  }
 });
 const quiet=console.error;console.error=()=>{};
 try{
  assert.equal((await signup(raw('/api/signup','{"username":"gir"}'))).status,502);
  const undo=calls.find(call=>call.table==='checkpoint_users'&&call.method==='DELETE');
  assert.ok(undo,'the stranded user row must be deleted');assert.equal(undo.query.get('username'),'eq.gir');
  assert.deepEqual(users,[],'the username is free again');
  sessionsFail=false;
  const retry=await signup(raw('/api/signup','{"username":"gir"}'));
  assert.equal(retry.status,201,'the retry must not be told the name is taken');
  assert.match(retry.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
 }finally{restore();console.error=quiet}
});
test('issuing a session sweeps that username’s expired rows without blocking the response',async()=>{
 const {calls,restore}=install(()=>new Response(null,{status:201}));
 try{
  const before=Date.now();await issueSession('gir');
  assert.ok(Date.now()-before<1000);
  await new Promise(resolve=>setTimeout(resolve,0));
  const sweep=calls.find(call=>call.method==='DELETE');
  assert.ok(sweep,'an expiry sweep must be fired');
  assert.equal(sweep.table,'checkpoint_sessions');assert.equal(sweep.query.get('username'),'eq.gir');
  assert.match(sweep.query.get('expires_at'),/^lt\.\d{4}-\d{2}-\d{2}T/);
 }finally{restore()}
});
// The board payload: no per-hour timestamps, and the "Studying now" badge decided here.
const boardStub=(posts,extra={})=>install((table,u)=>{
 if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun',time_zone:zone}]);
 if(table==='checkpoint_posts')return Response.json(posts);
 if(table==='checkpoint_stats')return extra.stats??Response.json({code:'PGRST202'},{status:404});
 if(table==='checkpoint_days')return Response.json((extra.days||[today]).map(post_day=>({post_day})));
 if(table==='checkpoint_breaks')return Response.json(extra.breaks||[]);
 if(table==='checkpoint_study_days')return Response.json(extra.studyDays||[]);
 // A function, when the same answer has to be given twice: awakeFor and connectedFor both ask, and
 // one Response body can only be read once.
 if(table==='checkpoint_awake')return typeof extra.awake==='function'?extra.awake():extra.awake??Response.json([]);
});
const COUNTS={minutes:90,sessions:2,questions:40,correct:36,cards_reviewed:12,target_minutes:60,target_hit:true};
const hourPost=(id,message,minutesAgo)=>({id,username:'gir',message,created_at:'2026-10-12T18:00:00Z',post_day:today,study:{...COUNTS},source_updated_at:'2026-10-12T18:00:00Z',received_at:new Date(Date.now()-minutesAgo*60000).toISOString(),bucket_start:'2026-10-12T18:00:00Z'});
test('no per-hour timestamp reaches the browser; the server decides "Studying now"',async()=>{
 const posts=[hourPost('11111111-1111-4111-8111-111111111111','Studying now. Trig practice.',1),
  hourPost('22222222-2222-4222-8222-222222222222','Studying now. Trig practice.',20),
  hourPost('33333333-3333-4333-8333-333333333333','Wrapped up for the day.',1),
  {id:'44444444-4444-4444-8444-444444444444',username:'gir',message:'A plain checkpoint.',created_at:'2026-10-12T17:00:00Z',post_day:today,study:null,source_updated_at:null,received_at:'2026-10-12T17:00:01Z',bucket_start:null}];
 const daily={message:'Studying now. Trig practice.',post_day:today,study:{...COUNTS},source_updated_at:'2026-10-12T18:00:00Z',received_at:new Date(Date.now()-60000).toISOString()};
 const {calls,restore}=boardStub(posts,{studyDays:[daily]});
 try{
  const board=await getBoard(null,'gir',null);
  const serialized=JSON.stringify(board);
  for(const leak of ['source_updated_at','received_at'])assert.ok(!serialized.includes(leak),leak+' reached the public board payload');
  assert.deepEqual(board.posts.map(post=>post.studying),[true,false,false,undefined]);
  assert.equal(board.dailyStudy.studying,true);
  // The post select may still read received_at — it is what the boolean is computed from — but
  // source_updated_at is not read at all outside the weekly query that reduces it server-side.
  const feed=calls.find(call=>call.table==='checkpoint_posts').query.get('select');
  assert.ok(!feed.includes('source_updated_at'),'the feed must not fetch source_updated_at');
  assert.ok(calls.find(call=>call.table==='checkpoint_study_days').query.get('select').includes('source_updated_at'),'the weekly query still needs it');
 }finally{restore()}
});
test('a failing awake or connected query leaves the family a working board',async()=>{
 // Both pills are decoration, so every failure degrades to false. A 404 that is NOT the missing
 // table (PGRST205) is still a fault though, and must be logged rather than read as "not awake".
 for(const answer of [()=>Response.json({message:'boom'},{status:500}),()=>Response.json({code:'PGRST002'},{status:404})]){
  const {restore}=boardStub([],{awake:answer});
  const quiet=console.error,logged=[];console.error=(...parts)=>logged.push(parts.join(' '));
  try{
   const board=await getBoard(null,'gir',null);
   assert.equal(board.awake,false);assert.equal(board.connected,false);
   assert.equal(board.displayName,'Varun');assert.equal(board.stats.xp,100);
   assert.ok(logged.some(line=>line.startsWith('Optional board status failed:')),'the failure is still logged server-side');
  }finally{restore();console.error=quiet}
 }
 // The documented fallback stays silent: before supabase/awake_status.sql there is no table.
 const {restore}=boardStub([],{awake:()=>Response.json({code:'PGRST205'},{status:404})});
 const quiet=console.error,logged=[];console.error=(...parts)=>logged.push(parts.join(' '));
 try{
  assert.equal((await getBoard(null,'gir',null)).awake,false);
  assert.ok(!logged.some(line=>line.startsWith('Optional board status failed:')),'a migration that is simply not applied is not a failure');
 }finally{restore();console.error=quiet}
});
test('stats come from one RPC, and the fallback walk matches it day for day across a break',async()=>{
 const days=[back(today,4),back(today,1),today],breaks=[{start_day:back(today,3),until_day:back(today,2)}];
 const expected={days,streak:3,xp:300,level:2,postedToday:true};
 const viaRpc=boardStub([],{days,breaks,stats:Response.json({days,streak:3,posted_today:true})});
 try{
  const board=await getBoard(null,'gir',null);
  assert.deepEqual(board.stats,expected);
  // One call, not a page-by-page walk of the whole history.
  assert.equal(viaRpc.calls.filter(call=>call.table==='checkpoint_days').length,0);
  assert.deepEqual(viaRpc.calls.find(call=>call.table==='checkpoint_stats').body,{p_username:'gir',p_today:today});
 }finally{viaRpc.restore()}
 const viaFallback=boardStub([],{days,breaks});
 try{assert.deepEqual((await getBoard(null,'gir',null)).stats,expected)}finally{viaFallback.restore()}
});
