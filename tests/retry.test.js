import test from 'node:test';
import assert from 'node:assert/strict';
import {database,RETRY_DELAYS} from '../lib/server.js';
import {issueSession} from '../lib/sessions.js';
// RETRY_DELAYS is exported so a test can zero the waits; the originals go back on restore().
const install=answer=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-secret';
 const previous=globalThis.fetch,delays=[...RETRY_DELAYS],log=console.error,calls=[];
 RETRY_DELAYS.fill(0);console.error=()=>{};
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),method:options.method||'GET'});const next=answer(calls.length);if(next instanceof Error)throw next;return next};
 return {calls,restore(){globalThis.fetch=previous;console.error=log;RETRY_DELAYS.splice(0,RETRY_DELAYS.length,...delays)}};
};
const unavailable=()=>new Response('',{status:503});
test('a GET recovers when a 503 is followed by a 200',async()=>{
 const stub=install(n=>n===1?unavailable():Response.json([{post_day:'2026-10-15'}]));
 try{
  assert.deepEqual(await database('checkpoint_days?select=post_day'),[{post_day:'2026-10-15'}]);
  assert.equal(stub.calls.length,2);
 }finally{stub.restore()}
});
test('a GET recovers from a network fault, and gives up after two retries',async()=>{
 const flaky=install(n=>n<3?new TypeError('fetch failed'):Response.json([]));
 try{assert.deepEqual(await database('checkpoint_days?select=post_day'),[]);assert.equal(flaky.calls.length,3)}finally{flaky.restore()}
 const down=install(unavailable);
 try{
  await assert.rejects(database('checkpoint_days?select=post_day'),error=>error.status===502&&error.databaseStatus===503);
  assert.equal(down.calls.length,3,'one try plus two retries, never more');
 }finally{down.restore()}
});
test('a 409 is an answer, not a fault, and surfaces on the first try',async()=>{
 // retry:true on purpose: 4xx must stay un-retried even when the caller opted in, because signup
 // reads 409 as "username taken" and board.js reads 404 as "migration not applied".
 const stub=install(()=>Response.json({code:'23505'},{status:409}));
 try{
  await assert.rejects(database('checkpoint_users',{method:'POST',retry:true,body:'{}'}),error=>error.status===502&&error.databaseStatus===409);
  assert.equal(stub.calls.length,1);
 }finally{stub.restore()}
});
test('the session POST is attempted exactly once, so a retry cannot duplicate a session row',async()=>{
 const stub=install(unavailable);
 try{
  await assert.rejects(issueSession('gir'),error=>error.databaseStatus===503);
  assert.deepEqual(stub.calls.map(call=>call.method),['POST']);
 }finally{stub.restore()}
});
test('one deadline covers every attempt, so a wait that cannot fit ends the retries',async()=>{
 const stub=install(unavailable);
 // Longer than the whole 12 s budget. A per-attempt timeout would still retry here; a shared
 // deadline sees the wait will not fit and gives up, instead of blowing the function budget.
 RETRY_DELAYS[0]=30000;
 try{
  await assert.rejects(database('checkpoint_days?select=post_day'),error=>error.databaseStatus===503);
  assert.equal(stub.calls.length,1);
 }finally{stub.restore()}
});
