import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePost,validateUsername,statsForDays,sameOrigin,easternDay,studyDay} from '../lib/server.js';
import {POST as signup} from '../app/api/signup/route.js';
import {POST as signin} from '../app/api/enter/route.js';
import {POST as post} from '../app/api/posts/route.js';
import {POST as signout} from '../app/api/signout/route.js';
import {GET as board} from '../app/api/board/route.js';
const ID='4966d3f8-43cb-47ba-950e-97f7d72c5998';
const request=(path,body,cookie)=>new Request('https://checkpoint.vas-anbu.dev'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
test('validates usernames, bounded updates, and same-origin writes',()=>{
 assert.equal(validateUsername(' Brother '),'brother');
 for(const input of ['x','has space','x'.repeat(25)])assert.throws(()=>validateUsername(input));
 assert.deepEqual(validatePost({id:ID,username:'Brother',message:'  Progress  '},'brother'),{id:ID,username:'brother',message:'Progress'});
 for(const body of [{id:ID,username:'other',message:'Progress'},{id:ID,username:'brother',message:' '},{id:ID,username:'brother',message:'x'.repeat(2001)}])assert.throws(()=>validatePost(body,'brother'));
 assert.equal(sameOrigin(new Request('https://checkpoint.vas-anbu.dev/api/posts',{headers:{Origin:'https://other.test'}})),false);
});
test('Eastern calendar conversion and 4 a.m. study days preserve daily awards',()=>{
 assert.equal(easternDay(new Date('2026-07-12T03:59:59Z')),'2026-07-11');
 assert.equal(easternDay(new Date('2026-07-12T04:00:00Z')),'2026-07-12');
 assert.equal(easternDay(new Date('2026-01-12T04:59:59Z')),'2026-01-11');
 assert.equal(easternDay(new Date('2026-01-12T05:00:00Z')),'2026-01-12');
 assert.equal(statsForDays(['2026-07-11','2026-07-11'],new Date('2026-07-12T03:59:59Z')).xp,100);
 assert.equal(statsForDays(['2026-07-11'],new Date('2026-07-12T08:00:00Z')).postedToday,false);
 assert.equal(statsForDays(['2026-07-11'],new Date('2026-07-12T04:00:00Z')).streak,1);
 assert.equal(statsForDays(['2026-03-07','2026-03-08','2026-03-09'],new Date('2026-03-09T08:01:00Z')).streak,3);
 assert.equal(statsForDays(['2026-10-31','2026-11-01','2026-11-02'],new Date('2026-11-02T09:01:00Z')).streak,3);
});
test('independent persistent device sessions share posts; sign-out revokes only that device',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-secret';
 const original=globalThis.fetch,users=[],sessions=[],posts=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1),q=u.searchParams,method=options.method||'GET';
  const body=options.body?JSON.parse(options.body):null;
  if(table==='checkpoint_users'){
   if(method==='POST'){if(users.some(user=>user.username===body.username))return Response.json({}, {status:409});users.push(body);return new Response(null,{status:201})}
   return Response.json(users.filter(user=>!q.has('username')||q.get('username')==='eq.'+user.username));
  }
  if(table==='checkpoint_sessions'){
   if(method==='POST'){sessions.push(body);return new Response(null,{status:201})}
   const index=sessions.findIndex(row=>q.get('token_hash')==='eq.'+row.token_hash);
   if(method==='DELETE'){if(index>=0)sessions.splice(index,1);return new Response(null,{status:204})}
   const match=index<0?[]:[sessions[index]].filter(row=>row.expires_at>q.get('expires_at').slice(3));return Response.json(match);
  }
  if(table==='checkpoint_breaks'||table==='checkpoint_study_days'||table==='checkpoint_awake')return Response.json([]);
  if(table==='checkpoint_posts'){
   if(method==='POST'){if(!posts.some(row=>row.id===body.id))posts.push({...body,created_at:new Date().toISOString(),post_day:studyDay()});return new Response(null,{status:201})}
   return Response.json(posts.filter(row=>q.get('username')==='eq.'+row.username));
  }
  if(table==='checkpoint_days')return Response.json([...new Set(posts.filter(row=>q.get('username')==='eq.'+row.username).map(row=>row.post_day))].map(post_day=>({post_day})));
  throw Error('Unexpected table '+table);
 };
 try{
  const created=await signup(request('/api/signup',{username:'brother',displayName:'Alex'}));assert.equal(created.status,201);
  const cookieA=created.headers.get('Set-Cookie').split(';')[0];assert.match(created.headers.get('Set-Cookie'),/HttpOnly; SameSite=Lax; Path=\/; Max-Age=15552000/);
  assert.ok(!sessions[0].token_hash.includes(cookieA.split('=')[1]));assert.equal(sessions[0].token_hash,createHash('sha256').update(cookieA.split('=')[1]).digest('hex'));
  assert.equal((await signup(request('/api/signup',{username:'brother'}))).status,409);
  assert.equal((await signin(request('/api/enter',{username:'missing'}))).status,404);
  const signed=await signin(request('/api/enter',{username:'BROTHER'}));assert.equal(signed.status,200);
  const cookieB=signed.headers.get('Set-Cookie').split(';')[0];assert.notEqual(cookieA,cookieB);
  assert.equal((await post(request('/api/posts',{id:ID,message:'Progress',username:'impersonated'},cookieA))).status,201);
  assert.equal(posts[0].username,'brother');
  assert.equal((await post(request('/api/posts',{id:ID,message:'Progress'},cookieA))).status,201);assert.equal(posts.length,1);
  const feed=await (await board(request('/api/board',null,cookieB))).json();assert.equal(feed.currentUser.username,'brother');assert.equal(feed.stats.xp,100);assert.equal(feed.posts.length,1);
  assert.equal((await signout(request('/api/signout',{},cookieA))).status,200);
  assert.equal((await post(request('/api/posts',{id:ID,message:'No session'},cookieA))).status,401);
  assert.equal((await (await board(request('/api/board',null,cookieB))).json()).currentUser.username,'brother');
  sessions[0].expires_at='2000-01-01T00:00:00Z';assert.equal((await post(request('/api/posts',{id:ID,message:'Expired'},cookieB))).status,401);
 }finally{globalThis.fetch=original}
});
test('pagination includes same-time rows using the ID as a second cursor key',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-secret';
 const previous=globalThis.fetch,time='2026-10-11T12:00:00+00:00';let paging=false;
 const rows=Array.from({length:51},(_,i)=>({id:'00000000-0000-4000-8000-'+String(100-i).padStart(12,'0'),username:'brother',message:'Test',created_at:time,post_day:'2026-10-11'}));
 globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('checkpoint_breaks')||u.pathname.endsWith('checkpoint_study_days')||u.pathname.endsWith('checkpoint_awake'))return Response.json([]);if(u.pathname.endsWith('checkpoint_users'))return Response.json([{username:'brother',display_name:'Alex'}]);if(u.pathname.endsWith('checkpoint_days'))return Response.json([{post_day:'2026-10-11'}]);if(paging){assert.match(u.searchParams.get('or'),/and\(created_at.eq./);assert.match(u.searchParams.get('or'),/id.lt./);return Response.json(rows.slice(50))}return Response.json(rows)};
 try{const response=await board(request('/api/board'));assert.equal(response.status,200);const result=await response.json();assert.equal(result.posts.length,50);paging=true;const next=await (await board(request('/api/board?before='+encodeURIComponent(result.next)))).json();assert.equal(next.posts.length,1);assert.equal(next.next,null);assert.equal((await board(request('/api/board?before=invalid'))).status,400)}finally{globalThis.fetch=previous}
});
