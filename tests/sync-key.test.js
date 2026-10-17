import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {POST as issueKey,DELETE as revokeKey} from '../app/api/sync-key/route.js';
import {POST as sync} from '../app/api/checkpoint/route.js';

const SESSION='a'.repeat(64),SESSION_HASH=createHash('sha256').update(SESSION).digest('hex');
const MUM='d'.repeat(64),MUM_HASH=createHash('sha256').update(MUM).digest('hex');
const ORIGIN='https://checkpoint.vas-anbu.dev';
const env=()=>{process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key'};

// A stub that implements the three functions supabase/migrations/007 adds, with the same rules: issue
// APPENDS and caps at five, revoke-one needs a prefix that names exactly one of the caller's rows,
// revoke-all empties them. The point of modelling them rather than returning ok is that the tests
// below are about which of them the route calls, with which username, and what that leaves behind.
const install=world=>{
 env();const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),name=u.pathname.replace('/rest/v1/',''),table=name.split('?')[0];
  const body=options.body?JSON.parse(options.body):null;
  calls.push({table,method:options.method||'GET',body,query:u.searchParams});
  if(world.missing)return Response.json({code:'PGRST202',message:'Could not find the function '+table},{status:404});
  const keys=world.checkpoint_api_keys;
  if(table==='rpc/checkpoint_issue_key'){
   if(!world.checkpoint_users.some(u2=>u2.username===body.p_username))return Response.json({code:'CP002',message:'no such user'},{status:400});
   if(!/^[0-9a-f]{64}$/.test(body.p_token_hash||''))return Response.json({code:'CP003',message:'invalid key'},{status:400});
   if(keys.filter(k=>k.username===body.p_username).length>=5)return Response.json({code:'CP001',message:'too many keys'},{status:400});
   const created=new Date().toISOString();
   keys.push({username:body.p_username,token_hash:body.p_token_hash,created_at:created});
   return Response.json(created);
  }
  if(table==='rpc/checkpoint_revoke_key'){
   const hit=keys.filter(k=>k.username===body.p_username&&k.token_hash.startsWith(body.p_prefix));
   if(hit.length!==1)return Response.json(0);
   world.checkpoint_api_keys=keys.filter(k=>k!==hit[0]);
   return Response.json(1);
  }
  if(table==='rpc/checkpoint_revoke_keys'){
   const gone=keys.filter(k=>k.username===body.p_username).length;
   world.checkpoint_api_keys=keys.filter(k=>k.username!==body.p_username);
   return Response.json(gone);
  }
  if(table==='checkpoint_sessions'){
   const hash=u.searchParams.get('token_hash')?.slice(3);
   const row=world.checkpoint_sessions.find(s=>s.token_hash===hash);
   return Response.json(row?[row]:[]);
  }
  if(table==='checkpoint_users'){
   const username=u.searchParams.get('username')?.slice(3);
   return Response.json(world.checkpoint_users.filter(x=>x.username===username));
  }
  if(table==='checkpoint_api_keys'){
   const hash=u.searchParams.get('token_hash')?.slice(3);
   return Response.json(world.checkpoint_api_keys.filter(k=>!hash||k.token_hash===hash));
  }
  if(table==='checkpoint_attempts')return Response.json([]);
  return Response.json([]);
 };
 return {calls,restore(){globalThis.fetch=previous}};
};
const world=()=>({
 checkpoint_users:[{username:'gir',display_name:'Varun',time_zone:'America/New_York'},{username:'mum',display_name:'Mum',time_zone:'America/New_York'}],
 checkpoint_sessions:[{token_hash:SESSION_HASH,username:'gir',expires_at:'2099-01-01T00:00:00Z'},{token_hash:MUM_HASH,username:'mum',expires_at:'2099-01-01T00:00:00Z'}],
 checkpoint_api_keys:[],
});
const post=(cookie=SESSION,origin=ORIGIN)=>new Request(ORIGIN+'/api/sync-key',{method:'POST',headers:{origin,...(cookie?{cookie:'checkpoint_session='+cookie}:{})}});
const del=(query='',cookie=SESSION,origin=ORIGIN)=>new Request(ORIGIN+'/api/sync-key'+query,{method:'DELETE',headers:{origin,...(cookie?{cookie:'checkpoint_session='+cookie}:{})}});

test('a new key is ADDITIONAL: the key Miss Log is already using keeps working',async()=>{
 const state=world(),stub=install(state);
 try{
  const first=await (await issueKey(post())).json();
  const second=await (await issueKey(post())).json();
  assert.match(first.key,/^cp_[A-Za-z0-9_-]{64}$/);
  assert.notEqual(first.key,second.key);
  assert.equal(state.checkpoint_api_keys.length,2,'issuing replaced a key instead of adding one: the live sync would have broken');
  // The whole promise of the panel: the OLD key still authenticates after a new one is made.
  for(const key of [first.key,second.key]){
   const response=await sync(new Request(ORIGIN+'/api/checkpoint',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({})}));
   assert.notEqual(response.status,401,'a key this route issued was not recognized by /api/checkpoint');
  }
  // Nothing anywhere stores the plaintext: only its sha256 reached the database.
  const stored=state.checkpoint_api_keys.map(k=>k.token_hash);
  assert.deepEqual(stored,[createHash('sha256').update(first.key).digest('hex'),createHash('sha256').update(second.key).digest('hex')]);
  for(const hash of stored)assert.ok(!hash.includes('cp_'),'a key itself was written to the database');
 }finally{stub.restore()}
});

test('revoking names one key, and never anybody else’s',async()=>{
 const state=world(),stub=install(state);
 try{
  const mine=await (await issueKey(post())).json();
  const other=await (await issueKey(post())).json();
  state.checkpoint_api_keys.push({username:'mum',token_hash:'f'.repeat(64),created_at:new Date().toISOString()});
  const removed=await (await revokeKey(del('?id='+mine.id))).json();
  assert.equal(removed.removed,1);
  assert.equal(state.checkpoint_api_keys.filter(k=>k.username==='gir').length,1,'the wrong number of the owner’s keys went');
  assert.equal(state.checkpoint_api_keys.filter(k=>k.username==='mum').length,1,'another person’s key was revoked');
  // The revoked key stops working; the one that was kept does not.
  const dead=await sync(new Request(ORIGIN+'/api/checkpoint',{method:'POST',headers:{authorization:'Bearer '+mine.key,'content-type':'application/json'},body:'{}'}));
  assert.equal(dead.status,401,'a revoked key still authenticated');
  const live=await sync(new Request(ORIGIN+'/api/checkpoint',{method:'POST',headers:{authorization:'Bearer '+other.key,'content-type':'application/json'},body:'{}'}));
  assert.notEqual(live.status,401,'revoking one key took the other down with it');
 }finally{stub.restore()}
});

test('a prefix that names nothing is a 404, not a silent success',async()=>{
 const state=world(),stub=install(state);
 try{
  await issueKey(post());
  const response=await revokeKey(del('?id='+'9'.repeat(8)));
  assert.equal(response.status,404);
  assert.equal(state.checkpoint_api_keys.length,1,'a miss removed a key anyway');
  assert.equal((await revokeKey(del('?id=nothex'))).status,400,'a malformed id must not reach the database');
 }finally{stub.restore()}
});

test('revoking with no id disconnects Miss Log entirely',async()=>{
 const state=world(),stub=install(state);
 try{
  await issueKey(post());await issueKey(post());
  const result=await (await revokeKey(del())).json();
  assert.equal(result.removed,2);
  assert.equal(state.checkpoint_api_keys.length,0);
 }finally{stub.restore()}
});

test('the route is self-only, same-origin and signed in',async()=>{
 const state=world(),stub=install(state);
 try{
  assert.equal((await issueKey(post(SESSION,'https://evil.example'))).status,403,'a cross-origin page could mint a credential');
  assert.equal((await revokeKey(del('',SESSION,'https://evil.example'))).status,403);
  assert.equal((await issueKey(post(''))).status,401);
  assert.equal((await revokeKey(del('',''))).status,401);
  assert.equal(state.checkpoint_api_keys.length,0,'a refused request still wrote to the key table');
  // The username can only come from the session: mum's cookie gets mum's key, whatever else is sent.
  const hers=await (await issueKey(post(MUM))).json();
  assert.equal(state.checkpoint_api_keys.at(-1).username,'mum');
  assert.ok(hers.key.startsWith('cp_'));
 }finally{stub.restore()}
});

test('the sixth key is refused with the reason, not a 500',async()=>{
 const state=world(),stub=install(state);
 try{
  for(let i=0;i<5;i++)assert.equal((await issueKey(post())).status,201);
  const response=await issueKey(post());
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/Revoke one/i);
  assert.equal(state.checkpoint_api_keys.length,5);
 }finally{stub.restore()}
});

test('a deploy that lands before supabase/migrations/007 says so instead of failing',async()=>{
 const state={...world(),missing:true},stub=install(state);
 try{
  const response=await issueKey(post());
  assert.equal(response.status,501);
  assert.match((await response.json()).error,/migration 007/);
  assert.equal((await revokeKey(del())).status,501);
 }finally{stub.restore()}
});

test('the key never leaves the server except in the one response that mints it',()=>{
 const route=readFileSync(new URL('../app/api/sync-key/route.js',import.meta.url),'utf8');
 assert.doesNotMatch(route,/export async function GET/,'a key that can be read back is a key that leaks from any later bug that renders it');
 assert.match(route,/createHash\('sha256'\)/,'only the hash may reach the database');
 assert.doesNotMatch(route,/console\.(log|error|warn)\([^)]*token(?!Hash)/i,'a key must never be logged');
 const migration=readFileSync(new URL('../supabase/migrations/007_sync_key_rotation.sql',import.meta.url),'utf8');
 // The server must still not be able to write that table by any query of its own choosing.
 assert.doesNotMatch(migration,/grant\s+[^;]*\b(insert|delete|update)\b[^;]*on\s+public\.checkpoint_api_keys/i,
  'the server was granted direct write on the key table: the definer functions are the only way in');
 assert.match(migration,/security definer/i);
 for(const fn of ['checkpoint_issue_key','checkpoint_revoke_key','checkpoint_revoke_keys'])
  assert.match(migration,new RegExp('revoke all on function public\\.'+fn),fn+' must not be callable by anon or authenticated');
 assert.doesNotMatch(migration,/delete from public\.checkpoint_api_keys[^;]*;\s*insert into/i,
  'issuing must not delete the holder’s other keys: that is the live connection it would break');
});
