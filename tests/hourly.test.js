import test from 'node:test';
import assert from 'node:assert/strict';
import {studyDay,statsForDays} from '../lib/server.js';
import {validateSync,weeklyStudy} from '../lib/study.js';
import {getBoard} from '../lib/board.js';
const study={minutes:130,sessions:3,questions:120,correct:84,cards_reviewed:200,target_minutes:120,target_hit:true};
test('4 a.m. boundary follows local wall time across winter, summer and DST',()=>{
 for(const [before,after] of [['2026-07-12T07:59:59Z','2026-07-12T08:00:00Z'],['2026-01-12T08:59:59Z','2026-01-12T09:00:00Z'],['2026-03-08T07:59:59Z','2026-03-08T08:00:00Z'],['2026-11-01T08:59:59Z','2026-11-01T09:00:00Z']]){
  const date=after.slice(0,10),previous=new Date(date+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
  assert.equal(studyDay(new Date(before)),previous.toISOString().slice(0,10));assert.equal(studyDay(new Date(after)),date);
 }
 assert.equal(studyDay(new Date('2026-10-12T06:29:59Z'),'Asia/Kolkata'),'2026-10-12');
 assert.equal(studyDay(new Date('2026-10-11T22:29:59Z'),'Asia/Kolkata'),'2026-10-11');
 assert.equal(studyDay(new Date('2026-10-11T22:30:00Z'),'Asia/Kolkata'),'2026-10-12');
 assert.equal(statsForDays(['2026-10-11'],new Date('2026-10-12T07:59:00Z')).postedToday,true);
 assert.equal(statsForDays(['2026-10-11'],new Date('2026-10-12T08:00:00Z')).postedToday,false);
});
test('calendar-date clients and omitted dates normalize before 4 a.m.',()=>{
 const now=new Date('2026-10-12T07:55:00Z'),body={date:'2026-10-12',text:'Late study',study,updated_at:now.toISOString()};
 assert.equal(validateSync(body,'America/New_York',now).day,'2026-10-11');
 assert.equal(validateSync({...body,date:undefined},'America/New_York',now).day,'2026-10-11');
 assert.equal(validateSync({...body,date:'2026-10-11'},'America/New_York',now).day,'2026-10-11');
 const after=new Date('2026-10-12T08:01:00Z');assert.equal(validateSync({...body,updated_at:after.toISOString()},'America/New_York',after).day,'2026-10-12');
});
test('weekly totals choose the latest daily snapshot instead of summing hourly totals',()=>{
 const rows=[{post_day:'2026-10-11',source_updated_at:'2026-10-11T12:00:00Z',study},{post_day:'2026-10-11',source_updated_at:'2026-10-11T13:00:00Z',study:{...study,minutes:180,questions:200,correct:150}},{post_day:'2026-10-10',source_updated_at:'2026-10-10T18:00:00Z',study:{...study,minutes:60,questions:50,correct:25}}];
 const result=weeklyStudy(rows.reverse(),'2026-10-11');assert.equal(result.minutes,240);assert.equal(result.questions,250);assert.equal(result.accuracy,70);
});
test('today status loads independently of historical feed pagination',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-secret';const original=globalThis.fetch;
 const today=studyDay(),daily={post_day:today,message:'Latest day totals',study,source_updated_at:new Date().toISOString(),received_at:new Date().toISOString()};
 globalThis.fetch=async url=>{const u=new URL(url),table=u.pathname.split('/').at(-1);if(table==='checkpoint_stats')return Response.json({code:'PGRST202'},{status:404});if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun',time_zone:'America/New_York'}]);if(table==='checkpoint_posts')return Response.json([]);if(table==='checkpoint_days')return Response.json([{post_day:today}]);if(table==='checkpoint_breaks'||table==='checkpoint_awake')return Response.json([]);if(table==='checkpoint_study_days')return Response.json([daily]);throw Error('Unexpected table '+table)};
 try{const result=await getBoard(null,'gir',null);assert.equal(result.dailyStudy.study.correct,84);assert.equal(result.posts.length,0);assert.equal(result.weekly.minutes,130);assert.equal(result.stats.xp,100)}finally{globalThis.fetch=original}
});
