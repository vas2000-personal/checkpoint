import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {easternDay,statsForDays} from '../lib/server.js';
import {validateSync,validateTimeZone,weeklyStudy} from '../lib/study.js';
import {POST,OPTIONS} from '../app/api/checkpoint/route.js';
const now=new Date('2026-10-12T03:00:00Z');
const study={minutes:130,sessions:3,questions:120,correct:84,cards_reviewed:200,target_minutes:120,target_hit:true};
const payload={date:'2026-10-11',text:'Daily study totals',study,updated_at:'2026-10-11T21:05:00-04:00'};
test('sync validates dates, timestamps, counts and privacy boundaries',()=>{
 assert.equal(validateSync(payload,'America/New_York',now).day,'2026-10-11');
 assert.equal(validateSync({...payload,date:undefined},'Asia/Kolkata',now).day,'2026-10-12');
 for(const body of [{...payload,date:'2026-02-30'},{...payload,date:'2026-10-13'},{...payload,updated_at:'2026-10-11'},{...payload,updated_at:'2026-10-13T12:00:00Z'},{...payload,study:{...study,correct:121}},{...payload,study:{...study,minutes:-1}},{...payload,study:{...study,sessions:1.5}},{...payload,study:{...study,target_hit:false}},{...payload,study:{...study,notes:'private'}},{...payload,username:'another'}])assert.throws(()=>validateSync(body,'America/New_York',now));
 assert.equal(validateTimeZone('Asia/Kolkata'),'Asia/Calcutta');
 assert.throws(()=>validateTimeZone('not/a-zone'));
 assert.throws(()=>validateSync({holiday:true,until:'2026-10-10'},'America/New_York',now));
 assert.throws(()=>validateSync({holiday:true,until:'2028-10-11'},'America/New_York',now));
 assert.deepEqual(validateSync({holiday:true,until:'2026-10-20'},'America/New_York',now),{holiday:true,start_day:'2026-10-11',until_day:'2026-10-20'});
});
test('time zones, DST and inclusive breaks preserve XP rules and streaks',()=>{
 assert.equal(easternDay(new Date('2026-10-12T04:30:00Z'),'America/Los_Angeles'),'2026-10-11');
 assert.equal(easternDay(new Date('2026-10-12T04:30:00Z'),'America/New_York'),'2026-10-12');
 const days=['2026-10-08','2026-10-09','2026-10-09'];
 const breaks=[{start_day:'2026-10-10',until_day:'2026-10-20'}];
 assert.equal(statsForDays(days,new Date('2026-10-15T12:00:00Z'),'America/New_York',breaks).streak,2);
 assert.equal(statsForDays(days,new Date('2026-10-15T12:00:00Z'),'America/New_York',breaks).xp,200);
 assert.equal(statsForDays([...days,'2026-10-21'],new Date('2026-10-21T12:00:00Z'),'America/New_York',breaks).streak,3);
 assert.equal(statsForDays(days,new Date('2026-10-22T12:00:00Z'),'America/New_York',breaks).streak,0);
 assert.equal(statsForDays([],now,'America/New_York',breaks).streak,0);
});
test('weekly accuracy weights questions and includes empty days',()=>{
 const result=weeklyStudy([{post_day:'2026-10-10',study:{minutes:10,questions:10,correct:10}},{post_day:'2026-10-11',study:{minutes:100,questions:90,correct:45}},{post_day:'2026-10-01',study:{minutes:500,questions:500,correct:500}}],'2026-10-11');
 assert.equal(result.days.length,7);assert.equal(result.minutes,110);assert.equal(result.questions,100);assert.equal(result.accuracy,55);
 assert.equal(weeklyStudy([],'2026-10-11').accuracy,null);
});
test('bearer route is user-scoped, bounds bodies and supports cross-origin preflight',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';
 const key='cp_'+ 'a'.repeat(64),previous=globalThis.fetch;let writes=0;
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1);
  if(table==='checkpoint_api_keys'){assert.equal(u.searchParams.get('token_hash'),'eq.'+createHash('sha256').update(key).digest('hex'));return Response.json([{username:'gir'}])}
  if(table==='checkpoint_users')return Response.json([{time_zone:'America/New_York'}]);
  if(table==='checkpoint_sync'){const args=JSON.parse(options.body);assert.equal(args.p_username,'gir');writes++;return Response.json({ok:true,xp_awarded:100})}
  if(table==='checkpoint_breaks'){assert.equal(JSON.parse(options.body).username,'gir');return new Response(null,{status:201})}
  throw Error('Unexpected request '+table);
 };
 const req=(body,authorization='Bearer '+key)=>new Request('https://checkpoint.test/api/checkpoint',{method:'POST',headers:{authorization,'Content-Type':'application/json',Origin:'https://miss-log.test'},body:typeof body==='string'?body:JSON.stringify(body)});
 try{
  assert.equal(OPTIONS().status,204);assert.equal(OPTIONS().headers.get('Access-Control-Allow-Headers'),'Authorization, Content-Type');
  assert.equal((await POST(req(payload,''))).status,401);
  assert.equal((await POST(req('not json'))).status,400);
  assert.equal((await POST(req('x'.repeat(16385)))).status,413);
  assert.equal((await POST(req({...payload,username:'someone'}))).status,400);
  const res=await POST(req({...payload,date:easternDay(),updated_at:new Date().toISOString()}));assert.equal(res.status,200);assert.equal(res.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(writes,1);
  assert.equal((await POST(req({holiday:true,until:easternDay()}))).status,200);
 }finally{globalThis.fetch=previous}
});

