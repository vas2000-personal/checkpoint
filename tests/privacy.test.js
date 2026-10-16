import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fail,studyDay} from '../lib/server.js';
import {getBoard} from '../lib/board.js';
import {currentUser} from '../lib/sessions.js';
import {GET} from '../app/api/board/route.js';
const zone='America/New_York',today=studyDay(new Date(),zone),back=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)};
const KEY='cp_'+'c'.repeat(64),SECRET='sb_secret_9f3a2b',PROJECT='https://project.supabase.co';
const SESSION='d'.repeat(64),SESSION_HASH=createHash('sha256').update(SESSION).digest('hex');
// Everything the family may never see, as substrings of the serialized payload.
const FORBIDDEN=['awake_at','last_active_at','still_up','token_hash','cp_','sb_secret_','.supabase.co','topics','notes'];
const COUNTS={minutes:90,sessions:2,questions:40,correct:36,cards_reviewed:12,target_minutes:60,target_hit:true};
// Every table answers with rows that are full of forbidden columns. PostgREST returns the requested
// columns only, so the stub projects too: the day somebody widens a select, this dirt reaches the
// payload and these tests go red. That is the whole point — assert on the payload, not on the stub.
const rows=()=>({
 checkpoint_users:[{username:'gir',display_name:'Varun',time_zone:zone,api_key:KEY,supabase_url:PROJECT,awake_at:'2026-10-15T07:12:00Z'}],
 checkpoint_sessions:[{username:'gir',token_hash:SESSION_HASH,expires_at:'2099-01-01T00:00:00Z'}],
 checkpoint_awake:[{username:'gir',post_day:today,received_at:new Date().toISOString(),awake_at:'2026-10-15T07:12:00Z',last_active_at:'2026-10-15T23:40:00Z',still_up:true}],
 checkpoint_posts:[{id:'11111111-1111-4111-8111-111111111111',username:'gir',message:'Finished the practice set.',created_at:'2026-10-12T18:00:00Z',post_day:back(today,1),study:{...COUNTS},source_updated_at:'2026-10-12T18:00:00Z',received_at:'2026-10-12T18:00:05Z',topics:['Trig identities'],notes:'Chapter 7 was rough',question_text:'Solve for x',api_key:KEY,diagnostic:SECRET+' at '+PROJECT,token_hash:'f'.repeat(64)}],
 checkpoint_days:[0,1,2].map(n=>({username:'gir',post_day:back(today,n),awake_at:'2026-10-15T07:12:00Z'})),
 checkpoint_breaks:[{username:'gir',start_day:'2026-01-01',until_day:'2026-01-05',notes:'family trip',reason_text:'travel'}],
 checkpoint_study_days:[{username:'gir',post_day:today,message:'Steady day.',study:{...COUNTS},source_updated_at:'2026-10-15T18:00:00Z',received_at:new Date().toISOString(),topics:['Trig identities'],notes:'Chapter 7 was rough',question_text:'Solve for x',api_key:KEY,supabase_url:PROJECT}]
});
const project=(row,select)=>!select||select==='*'?row:Object.fromEntries(select.split(',').filter(column=>column in row).map(column=>[column,row[column]]));
const stub=(tables=rows())=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1);
  const matched=(tables[table]||[]).filter(row=>[...u.searchParams].every(([key,value])=>{
   if(!(key in row))return true;
   const dot=value.indexOf('.'),op=value.slice(0,dot),target=value.slice(dot+1),own=String(row[key]);
   return op==='eq'?own===target:op==='gte'?own>=target:op==='gt'?own>target:op==='lt'?own<target:op==='lte'?own<=target:true;
  }));
  return Response.json(matched.map(row=>project(row,u.searchParams.get('select'))));
 };
 return ()=>{globalThis.fetch=previous};
};
const viewerFor=cookie=>currentUser(new Request('https://checkpoint.test/api/board',{headers:cookie?{cookie:'checkpoint_session='+cookie}:{}}));
test('no times, keys, URLs, topics or notes reach the public board payload',async()=>{
 const restore=stub();
 try{
  const serialized=JSON.stringify(await getBoard(null,'gir',null));
  // awake_at/last_active_at/still_up and token_hash are unreachable today only because every select
  // names its columns; cp_/sb_secret_/.supabase.co likewise. Widening one select breaks this line.
  for(const secret of FORBIDDEN)assert.ok(!serialized.includes(secret),secret+' reached the public board payload');
 }finally{restore()}
});
test('the board still carries what the family reads signed out',async()=>{
 const restore=stub();
 try{
  const board=await getBoard(null,'gir',null);
  assert.equal(board.awake,true);assert.equal(board.connected,true);
  assert.equal(typeof board.awake,'boolean');assert.equal(typeof board.connected,'boolean');
  assert.equal(board.stats.xp,300);assert.equal(board.stats.streak,3);assert.equal(board.stats.level,2);
  assert.equal(board.dailyStudy.study.minutes,90);assert.equal(board.dailyStudy.study.questions,40);assert.equal(board.dailyStudy.study.correct,36);
  assert.equal(board.weekly.minutes,90);assert.equal(board.weekly.questions,40);assert.equal(board.weekly.accuracy,90);
  assert.equal(board.today,today);assert.equal(board.timeZone,zone);assert.equal(board.displayName,'Varun');
 }finally{restore()}
});
test('currentUser has an exact key set, because the board hands it to the browser whole',async()=>{
 const restore=stub();
 try{
  const viewer=await viewerFor(SESSION);
  assert.deepEqual(Object.keys(viewer).sort(),['display_name','time_zone','username']);
  const board=await getBoard(null,'gir',viewer);
  assert.deepEqual(Object.keys(board.currentUser).sort(),['display_name','time_zone','username']);
  assert.equal(await viewerFor(null),null);
 }finally{restore()}
});
test('fail() hides database detail and keeps author-written messages',async()=>{
 const quiet=console.error;console.error=()=>{};
 try{
  const leaky=fail(new Error('sb_secret_abc connection to https://x.supabase.co failed'));
  assert.equal(leaky.status,502);assert.equal(leaky.headers.get('Cache-Control'),'no-store');
  const hidden=await leaky.json();
  assert.equal(hidden.error,'The board is temporarily unavailable. Please try again.');
  for(const secret of ['sb_secret_','.supabase.co'])assert.ok(!JSON.stringify(hidden).includes(secret),secret+' reached the error response');
  const authored=fail(Object.assign(new Error('Write an update.'),{status:400}));
  assert.equal(authored.status,400);assert.equal((await authored.json()).error,'Write an update.');
 }finally{console.error=quiet}
});
test('the study jsonb is reduced to counts before it goes public',async()=>{
 const dirty=rows();
 for(const table of ['checkpoint_posts','checkpoint_study_days'])dirty[table][0].study={...COUNTS,topics:['Trig identities'],notes:'Chapter 7 was rough',question_text:'Solve for x'};
 const restore=stub(dirty);
 try{
  const serialized=JSON.stringify(await getBoard(null,'gir',null));
  for(const secret of ['topics','notes','question_text'])assert.ok(!serialized.includes(secret),secret+' reached the public board inside the study jsonb');
 }finally{restore()}
});
test('the /api/board route is no-store and just as clean',async()=>{
 const restore=stub();
 try{
  const response=await GET(new Request('https://checkpoint.test/api/board',{headers:{cookie:'checkpoint_session='+SESSION}}));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const serialized=JSON.stringify(await response.json());
  for(const secret of FORBIDDEN)assert.ok(!serialized.includes(secret),secret+' reached the /api/board response');
 }finally{restore()}
});
