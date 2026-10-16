import test from 'node:test';
import assert from 'node:assert/strict';
import {studyDay} from '../lib/server.js';
import {validateSync,validateAwake} from '../lib/study.js';
import {getBoard,awakeFor,connectedFor,CONNECTED_MS} from '../lib/board.js';
import {POST} from '../app/api/checkpoint/route.js';
const now=new Date('2026-10-12T18:30:00Z'),zone='America/New_York';
const body={awake_at:'2026-10-12T07:12:00-04:00'};
test('awake updates accept only awake_at, last_active_at and after_idle_min',()=>{
 assert.deepEqual(validateSync(body,zone,now),{awake:true,day:'2026-10-12',awake_at:'2026-10-12T11:12:00.000Z',last_active_at:null,still_up:false});
 const full=validateSync({...body,last_active_at:'2026-10-12T18:05:00Z',after_idle_min:540},zone,now);
 assert.equal(full.last_active_at,'2026-10-12T18:05:00.000Z');assert.equal(full.still_up,false);
 assert.equal(validateAwake({...body,after_idle_min:179},zone,now).still_up,true);
 assert.equal(validateAwake({...body,after_idle_min:180},zone,now).still_up,false);
 assert.equal(validateAwake({...body,after_idle_min:0},zone,now).still_up,true);
 for(const bad of [
  {...body,text:'extra'},{...body,date:'2026-10-12'},{...body,study:{}},{...body,holiday:true},
  {awake_at:'2026-10-12T07:12:00'},{awake_at:'2026-10-12'},{awake_at:'2026-02-30T07:12:00Z'},{awake_at:1760267520000},{awake_at:null},
  {awake_at:'2026-10-12T18:36:00Z'},{awake_at:'2026-10-11T06:29:00Z'},
  {...body,last_active_at:'2026-10-12T07:00:00-04:00'},{...body,last_active_at:'2026-10-12T19:00:00Z'},{...body,last_active_at:'2026-10-12T14:05'},
  {...body,after_idle_min:-1},{...body,after_idle_min:2.5},{...body,after_idle_min:'200'}
 ])assert.throws(()=>validateSync(bad,zone,now),{status:400},JSON.stringify(bad));
 // Five minutes of clock skew and 36 hours of retries are tolerated.
 assert.equal(validateAwake({awake_at:'2026-10-12T18:34:00Z'},zone,now).day,'2026-10-12');
 assert.equal(validateAwake({awake_at:'2026-10-11T06:31:00Z'},zone,now).day,'2026-10-10');
});
test('awake_at maps to the 4 a.m. study day in the profile time zone',()=>{
 const at=new Date('2026-10-13T09:00:00Z');
 assert.equal(validateAwake({awake_at:'2026-10-13T03:59:59-04:00'},zone,at).day,'2026-10-12');
 assert.equal(validateAwake({awake_at:'2026-10-13T04:00:00-04:00'},zone,at).day,'2026-10-13');
 assert.equal(validateAwake({awake_at:'2026-10-13T07:59:59Z'},zone,at).day,'2026-10-12');
 assert.equal(validateAwake({awake_at:'2026-10-12T22:30:00Z'},'Asia/Kolkata',at).day,'2026-10-13');
 // A late-night heartbeat cannot land on the next study day's row.
 assert.throws(()=>validateAwake({awake_at:'2026-10-13T02:00:00-04:00',last_active_at:'2026-10-13T04:10:00-04:00'},zone,at),{status:400});
 assert.equal(validateAwake({awake_at:'2026-10-13T02:00:00-04:00',last_active_at:'2026-10-13T03:50:00-04:00'},zone,at).day,'2026-10-12');
});
test('awake route stores through its RPC without XP or study posts',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';
 const key='cp_'+'b'.repeat(64),previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const table=new URL(url).pathname.split('/').at(-1);calls.push(table);
  if(table==='checkpoint_attempt')return Response.json({allowed:true,retry_after:60});
  if(table==='checkpoint_api_keys')return Response.json([{username:'gir'}]);
  if(table==='checkpoint_users')return Response.json([{time_zone:zone}]);
  if(table==='checkpoint_awake'){const a=JSON.parse(options.body);assert.equal(a.p_username,'gir');assert.equal(a.p_day,studyDay(new Date(a.p_awake_at),zone));assert.equal(a.p_still_up,true);return Response.json({ok:true,date:a.p_day,awake_at:'2026-01-01T12:00:00+00:00',still_up:true,last_active_at:a.p_last_active_at})}
  throw Error('Unexpected request '+table);
 };
 const at=new Date(Date.now()-60000).toISOString(),req=b=>new Request('https://checkpoint.test/api/checkpoint',{method:'POST',headers:{authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(b)});
 try{
  const res=await POST(req({awake_at:at,last_active_at:at,after_idle_min:20}));assert.equal(res.status,200);
  const out=await res.json();assert.deepEqual(Object.keys(out).sort(),['awake_at','date','last_active_at','ok']);
  // The stored (earliest) awake_at is echoed, not the request's.
  assert.equal(out.awake_at,'2026-01-01T12:00:00+00:00');assert.equal(out.date,studyDay(new Date(at),zone));
  assert.ok(!calls.includes('checkpoint_sync')&&!calls.includes('checkpoint_posts'));
  assert.equal((await POST(req({awake_at:at,minutes:5}))).status,400);
 }finally{globalThis.fetch=previous}
});
test('board shows today’s awake row and falls back to null before the migration',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';
 const previous=globalThis.fetch,today=studyDay(new Date(),zone),row={post_day:'2026-10-12'};let awake=()=>Response.json([row]);
 globalThis.fetch=async url=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1);
  if(table==='checkpoint_stats')return Response.json({code:'PGRST202'},{status:404});
  if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun',time_zone:zone}]);
  if(u.searchParams.get('select')==='received_at')return Response.json([]);
  if(table==='checkpoint_awake'){assert.equal(u.searchParams.get('select'),'post_day','only a yes/no is read, never the times');assert.equal(u.searchParams.get('username'),'eq.gir');assert.equal(u.searchParams.get('post_day'),'eq.'+today);return awake()}
  if(['checkpoint_posts','checkpoint_days','checkpoint_breaks','checkpoint_study_days'].includes(table))return Response.json([]);
  throw Error('Unexpected table '+table);
 };
 const quiet=console.error;console.error=()=>{};
 try{
  const up=await getBoard(null,'gir',null);assert.equal(up.awake,true);assert.ok(!JSON.stringify(up).includes('awake_at')&&!JSON.stringify(up).includes('last_active'),'no awake times reach the public board');
  awake=()=>Response.json([]);assert.equal((await getBoard(null,'gir',null)).awake,false);
  // PostgREST answers 404 (PGRST205) while the table is missing from its schema cache.
  awake=()=>Response.json({code:'PGRST205',message:'Could not find the table'},{status:404});
  const board=await getBoard(null,'gir',null);assert.equal(board.awake,false);assert.equal(board.displayName,'Varun');
  awake=()=>Response.json({},{status:500});await assert.rejects(()=>awakeFor('gir',today),{status:502});
 }finally{globalThis.fetch=previous;console.error=quiet}
});
test('Not connected: no study sync or awake update in 24 hours, and only a yes/no leaves the server',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';
 const previous=globalThis.fetch,now=new Date('2026-10-13T15:00:00Z');let last={study:null,awake:null},awakeMissing=false;
 globalThis.fetch=async url=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1),since=u.searchParams.get('received_at')?.slice(4);
  assert.equal(u.searchParams.get('select'),'received_at');assert.equal(since,new Date(+now-CONNECTED_MS).toISOString());
  if(table==='checkpoint_awake'&&awakeMissing)return Response.json({code:'PGRST205'},{status:404});
  const t=table==='checkpoint_study_days'?last.study:last.awake;return Response.json(t&&t>=since?[{received_at:t}]:[]);
 };
 try{
  assert.equal(await connectedFor('gir',now),false,'never in touch');
  last.study='2026-10-12T16:00:00Z';assert.equal(await connectedFor('gir',now),true,'a study sync 23 h ago');
  last.study='2026-10-12T14:00:00Z';assert.equal(await connectedFor('gir',now),false,'a study sync 25 h ago');
  last.awake='2026-10-13T09:00:00Z';assert.equal(await connectedFor('gir',now),true,'an awake update counts too');
  awakeMissing=true;assert.equal(await connectedFor('gir',now),false,'before the awake migration, study syncs alone decide');
 }finally{globalThis.fetch=previous}
});
