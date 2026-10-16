// MANUAL ONLY. Writes real data to the live board: signs up a throwaway user, posts real rows, creates real
// device sessions. Never schedule this, never run it from CI. Run it by hand after a deploy when you want
// end-to-end proof. For an unattended/scheduled check use the read-only scripts/live-check.mjs instead.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='https://checkpoint.vas-anbu.dev',username='qa_'+Date.now(),report={username,checks:[]};
async function call(path,body,cookie='',expected=200,origin=base){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(body?{origin}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')};}
const s=await call('/api/signup',{username,displayName:'Deployment QA'},'',201),c1=s.cookie.split(';')[0];assert.match(s.cookie,/HttpOnly/);assert.match(s.cookie,/Secure/);assert.match(s.cookie,/Max-Age=15552000/);report.checks.push('Signup and secure persistent cookie');
const id=randomUUID(),post={id,message:'Deployment verification: daily progress is saved.',username:'spoofed'};
await call('/api/posts',post,c1,201);await call('/api/posts',post,c1,201);
let b=(await call('/api/board?user='+username,null,c1)).data;
assert.equal(b.currentUser.username,username);assert.equal(b.posts.filter(p=>p.id===id).length,1);assert.equal(b.stats.xp,100);assert.equal(b.stats.streak,1);
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(b.today,day);assert.equal(b.posts[0].post_day,day);report.checks.push('Persistence, server attribution, idempotent retry, Eastern day and XP');
const c2=(await call('/api/enter',{username})).cookie.split(';')[0];assert.notEqual(c1,c2);b=(await call('/api/board?user='+username,null,c2)).data;assert.equal(b.posts[0].id,id);report.checks.push('Second independent device shares history');
await call('/api/signout',{},c1);await call('/api/posts',{id:randomUUID(),message:'Should fail'},c1,401);
b=(await call('/api/board?user='+username,null,c2)).data;assert.equal(b.currentUser.username,username);report.checks.push('Sign-out revokes only one device');
await call('/api/posts',{id:randomUUID(),message:'Second device verification.'},c2,201);b=(await call('/api/board?user='+username,null,c2)).data;assert.equal(b.stats.xp,100);assert.equal(b.posts.length,2);
await call('/api/posts',{id:randomUUID(),message:'Should fail'},c2,403,'https://example.com');assert.equal((await call('/api/board?user='+username,null)).data.currentUser,null);report.checks.push('Daily XP awarded once; cross-origin writes denied; public feed readable');
await call('/api/signout',{},c2);console.log(JSON.stringify(report,null,2));
