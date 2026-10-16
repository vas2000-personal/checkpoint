import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hashPassphrase,recoveryHash} from '../lib/passphrase.js';
import {POST as signup} from '../app/api/signup/route.js';
import {POST as signin} from '../app/api/enter/route.js';
import {POST as passphrase,GET as passphraseState} from '../app/api/passphrase/route.js';
// scrypt at N=16384 costs 50-100 ms, so the whole file derives once and every row reuses the secret.
const PASSPHRASE='the quiet bus',secret=hashPassphrase(PASSPHRASE);
const CODE='AAAA-BBBB-CCCC-DDDD-EEEE',CODE_HASH=recoveryHash(CODE);
const SESSION='e'.repeat(64),SESSION_HASH=createHash('sha256').update(SESSION).digest('hex');
const COOKIE='checkpoint_session='+SESSION;
const ago=minutes=>new Date(Date.now()-minutes*60000).toISOString();
const ahead=minutes=>new Date(Date.now()+minutes*60000).toISOString();
// Every stub records what it was asked for, so a test can assert on the request as well as the reply.
const install=handler=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{const u=new URL(url),table=u.pathname.split('/').at(-1);calls.push({table,method:options.method||'GET',query:u.searchParams,body:options.body?JSON.parse(options.body):null});
  return await handler(table,u,options)??Response.json([])};
 return {calls,restore(){globalThis.fetch=previous}};
};
// sessionAt is when the caller's device signed in. Nothing authorises a credential change off it any
// more, so the tests below vary it only to prove that it makes no difference.
const board=({credential=null,users=[{username:'gir',display_name:'Varun',time_zone:'America/New_York'}],sessionAt=ago(1)}={})=>install((table,u,options)=>{
 if(table==='checkpoint_attempt')return Response.json({allowed:true,retry_after:60});
 if(table==='checkpoint_passphrase_result')return Response.json({ok:JSON.parse(options.body).p_ok,failed_attempts:0,locked_until:null});
 if(table==='checkpoint_sessions')return options.method?new Response(null,{status:204}):Response.json(u.searchParams.get('token_hash')==='eq.'+SESSION_HASH?[{username:'gir',created_at:sessionAt}]:[]);
 if(table==='checkpoint_users')return options.method?new Response(null,{status:201}):Response.json(users);
 if(table==='checkpoint_credentials')return options.method?new Response(null,{status:201}):Response.json(credential?[credential]:[]);
});
const post=(path,body,cookie)=>new Request('https://checkpoint.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
const row=async extra=>({secret:await secret,recovery_hash:CODE_HASH,locked_until:null,created_at:ago(30),...extra});
const results=calls=>calls.filter(call=>call.table==='checkpoint_passphrase_result').map(call=>call.body.p_ok);

test('a username with no credential row enters exactly as before, and is offered enrollment',async()=>{
 const {calls,restore}=board();
 try{
  const response=await signin(post('/api/enter',{username:'gir'}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
  assert.deepEqual(await response.json(),{user:{username:'gir',display_name:'Varun',time_zone:'America/New_York'},enroll:true});
  assert.deepEqual(results(calls),[],'an un-enrolled name never touches the attempt counter');
 }finally{restore()}
});
test('an enrolled username is refused without a passphrase, and issues no session',async()=>{
 const {calls,restore}=board({credential:await row()});
 try{
  for(const body of [{username:'gir'},{username:'gir',passphrase:''},{username:'gir',passphrase:null}]){
   const response=await signin(post('/api/enter',body));
   assert.equal(response.status,401);
   assert.equal(response.headers.get('Set-Cookie'),null,'no session may be issued');
   assert.deepEqual(await response.json(),{error:'This username is protected by a passphrase.',needsPassphrase:true});
  }
  assert.equal(calls.filter(call=>call.table==='checkpoint_sessions'&&call.method==='POST').length,0);
  assert.deepEqual(results(calls),[],'refusing an empty field is not a failed attempt');
 }finally{restore()}
});
test('the right passphrase enters and the wrong one does not, and both outcomes reach the counter',async()=>{
 const {calls,restore}=board({credential:await row()});
 try{
  const wrong=await signin(post('/api/enter',{username:'gir',passphrase:'the quiet bud'}));
  assert.equal(wrong.status,401);assert.equal(wrong.headers.get('Set-Cookie'),null);
  assert.deepEqual(await wrong.json(),{error:'That passphrase does not match.',needsPassphrase:true});
  const right=await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}));
  assert.equal(right.status,200);
  assert.match(right.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
  assert.deepEqual(await right.json(),{user:{username:'gir',display_name:'Varun',time_zone:'America/New_York'}});
  // false,false,true: every attempt is charged BEFORE the derivation, so a burst of parallel guesses
  // cannot all clear one pre-check; the trailing true is what clears failed_attempts and the lock.
  assert.deepEqual(results(calls),[false,false,true]);
  const posted=calls.filter(call=>call.table==='checkpoint_passphrase_result');
  assert.deepEqual(posted[0].body,{p_username:'gir',p_ok:false,p_factor:'passphrase'});
  assert.equal(posted[0].method,'POST');
 }finally{restore()}
});
test('a locked credential answers 429 before any derivation, even for the right passphrase',async()=>{
 const {calls,restore}=board({credential:await row({locked_until:ahead(7)})});
 try{
  const response=await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}));
  // The correct passphrase is what makes this airtight: anything that reached verifyPassphrase
  // would have answered 200, so a 429 proves the lock was read from the select instead.
  assert.equal(response.status,429);
  assert.equal(response.headers.get('Set-Cookie'),null);
  assert.deepEqual(await response.json(),{error:'Too many tries. Try again in 7 minutes.',needsPassphrase:true});
  assert.deepEqual(results(calls),[],'a locked account is not charged another attempt');
 }finally{restore()}
});
test('an expired lock is spent, not sticky',async()=>{
 const {restore}=board({credential:await row({locked_until:ago(1)})});
 try{assert.equal((await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}))).status,200)}finally{restore()}
});
test('a recovery code deletes the credential row and hands the account back as username-only',async()=>{
 const {calls,restore}=board({credential:await row()});
 try{
  const wrong=await signin(post('/api/enter',{username:'gir',recovery:'0000-0000-0000-0000-0000'}));
  assert.equal(wrong.status,401);assert.equal(wrong.headers.get('Set-Cookie'),null);
  assert.deepEqual(await wrong.json(),{error:'That recovery code does not match.',needsPassphrase:true});
  assert.deepEqual(results(calls),[false]);
  // Typed in any shape: the normalizer is what accepts lowercase and missing dashes.
  const response=await signin(post('/api/enter',{username:'gir',recovery:' aaaabbbbccccddddeeee '}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
  assert.deepEqual(await response.json(),{user:{username:'gir',display_name:'Varun',time_zone:'America/New_York'},mustReset:true});
  const gone=calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='DELETE');
  assert.ok(gone,'the credential row must be deleted, not left half-locked');
  assert.equal(gone.query.get('username'),'eq.gir');
 }finally{restore()}
});
test('a database without migration 005 still signs everyone in, and says so loudly',async()=>{
 const {restore}=install(table=>table==='checkpoint_attempt'?Response.json({allowed:true,retry_after:60})
  :table==='checkpoint_users'?Response.json([{username:'gir',display_name:'Varun'}])
  :table==='checkpoint_credentials'?Response.json({code:'PGRST205'},{status:404}):new Response(null,{status:201}));
 const quiet=console.error,logged=[];console.error=(...parts)=>logged.push(parts.join(' '));
 try{
  const response=await signin(post('/api/enter',{username:'gir'}));
  assert.equal(response.status,200);assert.equal((await response.json()).enroll,true);
  // This fallback is a global bypass of every enrollment, so it must never fire silently.
  assert.ok(logged.some(line=>line.includes('PASSPHRASE CHECK BYPASSED')),'the bypass must be logged');
 }finally{restore();console.error=quiet}
});
test('a 404 that is not the missing table fails CLOSED and issues no session',async()=>{
 // PGRST205 is "that relation does not exist". A stale schema cache, a paused project, a replica or
 // a gateway all answer 404 too, and reading those as "not enrolled" would make every enrolled
 // account enterable by username alone, silently, for as long as the fault lasted.
 for(const answer of [Response.json({code:'PGRST002',message:'schema cache stale'},{status:404}),
  Response.json({code:'PGRST302'},{status:404}),Response.json({message:'no code at all'},{status:404}),
  new Response('<html>Not Found</html>',{status:404,headers:{'Content-Type':'text/html'}})]){
  const {calls,restore}=install(table=>table==='checkpoint_attempt'?Response.json({allowed:true,retry_after:60})
   :table==='checkpoint_users'?Response.json([{username:'gir',display_name:'Varun'}])
   :table==='checkpoint_credentials'?answer.clone():new Response(null,{status:201}));
  const quiet=console.error;console.error=()=>{};
  try{
   const response=await signin(post('/api/enter',{username:'gir'}));
   assert.equal(response.status,502);
   assert.equal(response.headers.get('Set-Cookie'),null,'no session may be issued on a fault');
   assert.equal((await response.json()).error,'The update could not be saved or loaded. Please try again.');
   assert.equal(calls.filter(call=>call.table==='checkpoint_sessions'&&call.method==='POST').length,0);
  }finally{restore();console.error=quiet}
 }
});
test('a recovery code is the way back in, so the lockout must not refuse it',async()=>{
 const {calls,restore}=board({credential:await row({locked_until:ahead(13)})});
 try{
  // Five wrong passphrases must not take away the only documented route back for a signed-out owner
  // on a new device. /api/passphrase has always done this; /api/enter now agrees with it.
  const response=await signin(post('/api/enter',{username:'gir',recovery:CODE}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
  assert.equal((await response.json()).mustReset,true);
  assert.ok(calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='DELETE'));
  // A wrong code while locked is still refused, and still charged.
  const wrong=await signin(post('/api/enter',{username:'gir',recovery:'0000-0000-0000-0000-0000'}));
  assert.equal(wrong.status,401);
  assert.equal((await wrong.json()).error,'That recovery code does not match.');
  assert.deepEqual(results(calls),[false]);
 }finally{restore()}
});
test('the lockout copy counts one minute in the singular',async()=>{
 const soon=new Date(Date.now()+30000).toISOString();
 const enter=board({credential:await row({locked_until:soon})});
 try{assert.equal((await(await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}))).json()).error,'Too many tries. Try again in 1 minute.')}finally{enter.restore()}
 const change=board({credential:await row({locked_until:soon})});
 try{assert.equal((await(await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',current:PASSPHRASE},COOKIE))).json()).error,'Too many tries. Try again in 1 minute.')}finally{change.restore()}
});
test('a burst of parallel guesses is counted before any of them derives',async()=>{
 // The counter is a single UPDATE, so the only question is whether a guess reaches it at all. Charged
 // after the derivation, every request in a burst cleared the same pre-check and the lockout never
 // saw them; charged before it, all of them land and the 10-per-minute limit is the real ceiling.
 const credential=await row({failed_attempts:0});
 const {calls,restore}=install((table,u,options)=>{
  if(table==='checkpoint_attempt')return Response.json({allowed:true,retry_after:60});
  if(table==='checkpoint_passphrase_result'){
   const ok=JSON.parse(options.body).p_ok;
   credential.failed_attempts=ok?0:credential.failed_attempts+1;
   if(!ok&&credential.failed_attempts>=5)credential.locked_until=ahead(15);
   return Response.json({ok,failed_attempts:credential.failed_attempts,locked_until:credential.locked_until});
  }
  if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun'}]);
  if(table==='checkpoint_credentials')return options.method?new Response(null,{status:201}):Response.json([credential]);
 });
 try{
  const tries=await Promise.all(Array.from({length:8},(_,i)=>signin(post('/api/enter',{username:'gir',passphrase:'guess number '+i}))));
  assert.ok(tries.every(response=>response.status===401),'no guess may enter');
  assert.equal(results(calls).length,8,'every guess in the burst is charged');
  assert.equal(credential.failed_attempts,8);
  assert.ok(credential.locked_until>new Date().toISOString(),'and the burst leaves the account locked');
  // The next request reads the lock from the select and never derives at all.
  assert.equal((await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}))).status,429);
  assert.equal(results(calls).length,8,'a locked account is not charged again');
 }finally{restore()}
});
test('nothing longer than the setter accepts is ever derived',async()=>{
 const {calls,restore}=board({credential:await row()});
 try{
  // 4 MiB used to be normalized and run through scrypt. The cap is 128 characters, so a longer one
  // cannot match any stored secret and is wrong by definition rather than expensive to check.
  for(const value of ['x'.repeat(129),'x'.repeat(4*1024*1024)]){
   const response=await signin(post('/api/enter',{username:'gir',passphrase:value}));
   assert.equal(response.status,401,String(value.length));
   assert.equal((await response.json()).error,'That passphrase does not match.');
  }
  const change=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',current:'x'.repeat(200000)},COOKIE));
  assert.equal(change.status,403);
  assert.equal(calls.filter(call=>call.table==='checkpoint_credentials'&&call.method!=='GET').length,0);
 }finally{restore()}
});
test('a body too large to be real is refused before it is parsed',async()=>{
 const {restore}=board({credential:await row()});
 try{
  const huge=new Request('https://checkpoint.test/api/enter',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':String(17000)},body:JSON.stringify({username:'gir',passphrase:'x'.repeat(16500)})});
  const response=await signin(huge);
  assert.equal(response.status,413);
  assert.equal((await response.json()).error,'That update is too large.');
 }finally{restore()}
});
test('an authentication path with no working rate limiter refuses instead of allowing every guess',async()=>{
 const credential=await row();
 for(const [name,route,body] of [['enter',signin,{username:'gir',passphrase:PASSPHRASE}],['signup',signup,{username:'gir'}],['passphrase',passphrase,{passphrase:'a new quiet bus',current:PASSPHRASE}]]){
  // Swallowing this failure left the guess counter switched off entirely, which is the opposite of
  // what a rate limiter is for. Only a missing function (PGRST202) means migration 004 is not
  // applied; anything else is a fault, and on these three routes a fault must refuse.
  for(const answer of [Response.json({message:'pool exhausted'},{status:503}),Response.json({code:'PGRST002'},{status:404}),Response.json({message:'nope'},{status:500})]){
   const {calls,restore}=install((table,u,options)=>{
    if(table==='checkpoint_attempt')return answer.clone();
    if(table==='checkpoint_users')return options.method?new Response(null,{status:201}):Response.json([{username:'gir',display_name:'Varun'}]);
    if(table==='checkpoint_sessions')return options.method?new Response(null,{status:204}):Response.json(u.searchParams.get('token_hash')==='eq.'+SESSION_HASH?[{username:'gir',created_at:ago(1)}]:[]);
    if(table==='checkpoint_credentials')return options.method?new Response(null,{status:201}):Response.json([credential]);
   });
   const quiet=console.error;console.error=()=>{};
   try{
    const response=await route(post('/api/'+name,body,COOKIE));
    assert.equal(response.status,503,name);
    assert.equal(response.headers.get('Retry-After'),'30');
    // The copy follows the path. A signed-in user changing their passphrase is not signing in, and
    // "Sign-in is briefly unavailable" was about a thing they were not doing.
    assert.equal((await response.json()).error,name==='passphrase'?'Your passphrase cannot be changed right now. Please try again in a moment.':'Sign-in is briefly unavailable. Please try again in a moment.',name);
    assert.equal(response.headers.get('Set-Cookie'),null,'no session, and no derivation');
    assert.deepEqual(results(calls),[],'nothing is derived or charged behind a dead limiter');
   }finally{restore();console.error=quiet}
  }
 }
});
test('a database without migration 004 still does not limit, exactly as documented',async()=>{
 const {restore}=install(table=>table==='checkpoint_attempt'?Response.json({code:'PGRST202',message:'function does not exist'},{status:404})
  :table==='checkpoint_users'?Response.json([{username:'gir',display_name:'Varun'}])
  :table==='checkpoint_credentials'?Response.json([]):new Response(null,{status:201}));
 const quiet=console.error,logged=[];console.error=(...parts)=>logged.push(parts.join(' '));
 try{
  assert.equal((await signin(post('/api/enter',{username:'gir'}))).status,200);
  assert.equal((await signup(post('/api/signup',{username:'gir'}))).status,201);
  assert.ok(!logged.some(line=>line.startsWith('Rate limit check unavailable')),'a feature that is simply not installed is not a limiter failure');
 }finally{restore();console.error=quiet}
});
test('the not-found copy is untouched by the credential branch',async()=>{
 const {restore}=board({users:[]});
 try{
  const response=await signin(post('/api/enter',{username:'nobody'}));
  assert.equal(response.status,404);
  assert.equal((await response.json()).error,'That username does not exist yet. Choose New user to create it.');
 }finally{restore()}
});

test('signing up with a passphrase writes the credential row and shows the recovery code once',async()=>{
 const {calls,restore}=board({users:[]});
 try{
  const response=await signup(post('/api/signup',{username:'gir',displayName:'Varun',passphrase:PASSPHRASE}));
  assert.equal(response.status,201);
  assert.match(response.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
  const payload=await response.json();
  assert.deepEqual(Object.keys(payload).sort(),['recovery','user']);
  assert.match(payload.recovery,/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
  const credential=calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='POST');
  assert.ok(credential,'the credential row must be inserted');
  assert.equal(credential.body.username,'gir');
  assert.match(credential.body.secret,/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(credential.body.recovery_hash,recoveryHash(payload.recovery),'only the hash is stored');
  assert.ok(credential.body.updated_at,'every write stamps updated_at');
  // The credential lands before the session, inside the branch the existing rollback guards.
  const order=calls.filter(call=>call.method==='POST').map(call=>call.table);
  assert.ok(order.indexOf('checkpoint_credentials')<order.indexOf('checkpoint_sessions'));
 }finally{restore()}
});
test('signing up without a passphrase is unchanged, and is offered enrollment',async()=>{
 const {calls,restore}=board({users:[]});
 try{
  const response=await signup(post('/api/signup',{username:'gir'}));
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{user:{username:'gir',display_name:'gir'},enroll:true});
  assert.equal(calls.filter(call=>call.table==='checkpoint_credentials').length,0);
 }finally{restore()}
});
test('a rejected passphrase never creates the account',async()=>{
 const {calls,restore}=board({users:[]});
 try{
  for(const [value,message] of [['short','Choose a passphrase of 8 to 128 characters.'],['password','That passphrase is too easy to guess. Please choose another one.'],['girgirgir','Your passphrase cannot be your username.']]){
   const response=await signup(post('/api/signup',{username:'girgirgir',passphrase:value}));
   assert.equal(response.status,400,value);
   assert.equal((await response.json()).error,message);
  }
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.table),[],'not even the rate limit is charged for a typo');
 }finally{restore()}
});

test('a change or a removal is refused without the current passphrase or the recovery code',async()=>{
 // No seniority: a live session, however old, is not authority over the credential. Usernames are
 // public, so anyone may hold a 180-day cookie for a name they do not own, and a rule that let that
 // cookie rewrite the passphrase would be a permanent master key over every future enrollment of it.
 for(const sessionAt of [ago(5),ago(90),ago(60*24*170)]){
  const {calls,restore}=board({credential:await row(),sessionAt});
  try{
   const blocked=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus'},COOKIE));
   assert.equal(blocked.status,409,'a change with nothing offered is a stale UI, not a failed attempt');
   assert.equal((await blocked.json()).error,'This username already has a passphrase. Change it from Settings.');
   const refused=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',current:'the quiet bud'},COOKIE));
   assert.equal(refused.status,403);
   assert.equal((await refused.json()).error,'That passphrase does not match.');
   const wrongCode=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',recovery:'0000-0000-0000-0000-0000'},COOKIE));
   assert.equal(wrongCode.status,403);
   assert.equal((await wrongCode.json()).error,'That recovery code does not match.');
   const removing=await passphrase(post('/api/passphrase',{remove:true},COOKIE));
   assert.equal(removing.status,403);
   assert.equal((await removing.json()).error,'Enter your current passphrase, or the recovery code you saved, to change it.');
   assert.equal((await passphrase(post('/api/passphrase',{remove:true,current:'the quiet bud'},COOKIE))).status,403);
   assert.equal(calls.filter(call=>call.table==='checkpoint_credentials'&&call.method!=='GET').length,0,'nothing was written, at any session age');
   assert.equal(calls.filter(call=>call.table==='checkpoint_sessions'&&call.method==='DELETE').length,0);
   // Every refusal above is metered: two wrong passphrases and one wrong recovery code.
   assert.deepEqual(results(calls),[false,false,false]);
  }finally{restore()}
 }
});
test('the current passphrase, or the recovery code, is what authorises a change',async()=>{
 const viaCurrent=board({credential:await row(),sessionAt:ago(90)});
 try{
  const allowed=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',current:PASSPHRASE},COOKIE));
  assert.equal(allowed.status,200);
  const payload=await allowed.json();
  assert.deepEqual(Object.keys(payload).sort(),['ok','protected','recovery']);
  assert.match(payload.recovery,/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
  assert.deepEqual(results(viaCurrent.calls),[false,true],'charged before the derivation, cleared after it');
  const changed=viaCurrent.calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='PATCH');
  assert.equal(changed.query.get('username'),'eq.gir');
  assert.match(changed.body.secret,/^scrypt\$16384\$8\$1\$/);
  assert.equal(changed.body.recovery_hash,recoveryHash(payload.recovery),'a change rotates the recovery code');
  assert.equal(changed.body.failed_attempts,0);assert.equal(changed.body.locked_until,null);
  assert.ok(changed.body.updated_at,'every write stamps updated_at');
  // created_at is a plain audit column now. Rewriting it is what inverted the old comparison and let
  // two devices hand the passphrase back and forth without either of them ever typing one.
  assert.equal(changed.body.created_at,undefined,'a change must not move created_at');
 }finally{viaCurrent.restore()}
 const viaCode=board({credential:await row(),sessionAt:ago(5)});
 try{
  const dropped=await passphrase(post('/api/passphrase',{remove:true,recovery:CODE.toLowerCase()},COOKIE));
  assert.equal(dropped.status,200);
  assert.deepEqual(await dropped.json(),{ok:true,protected:false});
  const gone=viaCode.calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='DELETE');
  assert.ok(gone);assert.equal(gone.query.get('username'),'eq.gir');
  assert.deepEqual(results(viaCode.calls),[],'a correct recovery code is not a failed attempt');
 }finally{viaCode.restore()}
});
test('a recovery code authorises a change, and still works while the account is locked out',async()=>{
 const {calls,restore}=board({credential:await row({locked_until:ahead(9)}),sessionAt:ago(5)});
 try{
  const current=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',current:PASSPHRASE},COOKIE));
  assert.equal(current.status,429);
  assert.equal((await current.json()).error,'Too many tries. Try again in 9 minutes.');
  assert.deepEqual(results(calls),[],'a locked account does no scrypt work');
  const response=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',recovery:CODE.toLowerCase()},COOKIE));
  assert.equal(response.status,200);
  assert.equal((await response.json()).protected,true);
 }finally{restore()}
});
test('enrolling from a signed-in device with no credential row returns the code once',async()=>{
 const {calls,restore}=board();
 try{
  const response=await passphrase(post('/api/passphrase',{passphrase:PASSPHRASE},COOKIE));
  assert.equal(response.status,200);
  const payload=await response.json();
  const credential=calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='POST');
  assert.equal(credential.body.username,'gir');
  assert.equal(credential.body.recovery_hash,recoveryHash(payload.recovery));
  assert.match(credential.body.secret,/^scrypt\$16384\$8\$1\$/);
  assert.ok(credential.body.created_at&&credential.body.updated_at);
  assert.equal(calls.filter(call=>call.table==='checkpoint_sessions'&&call.method==='DELETE').length,0,'other devices stay signed in by default');
 }finally{restore()}
});
test('signOutOthers deletes every session but this one',async()=>{
 const {calls,restore}=board();
 try{
  const response=await passphrase(post('/api/passphrase',{passphrase:PASSPHRASE,signOutOthers:true},COOKIE));
  assert.equal(response.status,200);
  assert.equal((await response.json()).signedOutOthers,true);
  const revoked=calls.find(call=>call.table==='checkpoint_sessions'&&call.method==='DELETE');
  assert.ok(revoked,'the other devices must be revoked');
  assert.equal(revoked.query.get('username'),'eq.gir');
  assert.equal(revoked.query.get('token_hash'),'neq.'+SESSION_HASH,'this device keeps its session');
 }finally{restore()}
});
test('the passphrase route needs a session, a same origin and something to do',async()=>{
 const {restore}=board({credential:await row()});
 try{
  const anonymous=await passphrase(post('/api/passphrase',{passphrase:PASSPHRASE}));
  assert.equal(anonymous.status,401);
  assert.equal((await anonymous.json()).error,'Please sign in.');
  const cross=new Request('https://checkpoint.test/api/passphrase',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test',Cookie:COOKIE},body:'{}'});
  assert.equal((await passphrase(cross)).status,403);
  const idle=await passphrase(post('/api/passphrase',{},COOKIE));
  assert.equal(idle.status,400);
  assert.equal((await idle.json()).error,'Choose a passphrase to set or remove.');
 }finally{restore()}
});
test('Settings reads the enrolled state from its own route, not from the public board payload',async()=>{
 // One key, and no session timestamp behind it: nothing is decided from the age of a cookie any
 // more, so the route has nothing of the sort to tell the UI.
 for(const sessionAt of [ago(5),ago(90)]){
  const enrolled=board({credential:await row(),sessionAt});
  try{assert.deepEqual(await(await passphraseState(post('/api/passphrase',{},COOKIE))).json(),{protected:true})}finally{enrolled.restore()}
 }
 const plain=board();
 try{
  assert.deepEqual(await(await passphraseState(post('/api/passphrase',{},COOKIE))).json(),{protected:false});
  assert.equal((await passphraseState(post('/api/passphrase',{}))).status,401);
 }finally{plain.restore()}
});

test('a wrong recovery code is metered on its own counter and cannot deny the passphrase path',async()=>{
 // DRIVEN before the fix: nine wrong recovery codes grew the one shared lock 60->120->240->480->900 s
 // and the owner's CORRECT passphrase then answered 429 "Try again in 15 minutes", sustainable for
 // ever at the 10-per-minute limit by anybody who knows the public username. Each factor now has its
 // own counter, its own level and its own lock, and a lock gates ONLY the factor that earned it.
 const {calls,restore}=board({credential:await row({recovery_locked_until:ahead(14)})});
 const factors=()=>calls.filter(call=>call.table==='checkpoint_passphrase_result').map(call=>call.body.p_factor);
 try{
  const refused=await signin(post('/api/enter',{username:'gir',recovery:'0000-0000-0000-0000-0000'}));
  assert.equal(refused.status,429,'the recovery lock does gate the recovery code: 80 bits must stay metered');
  assert.deepEqual(await refused.json(),{error:'Too many recovery-code tries. Try again in 14 minutes.',needsPassphrase:true});
  assert.deepEqual(factors(),[],'a locked factor is not charged again');
  // ...and it gates nothing else. This is the whole point.
  const right=await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}));
  assert.equal(right.status,200,'the owner still gets in with the right passphrase');
  assert.match(right.headers.get('Set-Cookie'),/^checkpoint_session=[0-9a-f]{64};/);
  assert.deepEqual(factors(),['passphrase','passphrase']);
  // The same split, session-gated at /api/passphrase.
  const byCode=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',recovery:CODE},COOKIE));
  assert.equal(byCode.status,429);
  assert.equal((await byCode.json()).error,'Too many recovery-code tries. Try again in 14 minutes.');
  const byCurrent=await passphrase(post('/api/passphrase',{passphrase:'a new quiet bus',current:PASSPHRASE},COOKIE));
  assert.equal(byCurrent.status,200,'and a locked recovery path never refuses a change authorised by the passphrase');
 }finally{restore()}
});
test('a wrong recovery code charges the recovery meter and never the passphrase one',async()=>{
 const {calls,restore}=board({credential:await row()});
 try{
  assert.equal((await signin(post('/api/enter',{username:'gir',recovery:'0000-0000-0000-0000-0000'}))).status,401);
  assert.equal((await passphrase(post('/api/passphrase',{remove:true,recovery:'0000-0000-0000-0000-0000'},COOKIE))).status,403);
  const charged=calls.filter(call=>call.table==='checkpoint_passphrase_result');
  assert.deepEqual(charged.map(call=>call.body.p_factor),['recovery','recovery'],'both routes agree on which meter a code belongs to');
  assert.deepEqual(charged.map(call=>call.body.p_ok),[false,false]);
 }finally{restore()}
});
test('a credential write returns its one-time code even when signing other devices out fails',async()=>{
 // The row is already committed when the follow-up runs, and the recovery code exists in that one
 // response and nowhere else. Awaiting a throwing revoke turned a successful write into a 502 and
 // discarded the code: DRIVEN, the row was written and the caller got only "please try again".
 const {calls,restore}=install((table,u,options)=>{
  if(table==='checkpoint_attempt')return Response.json({allowed:true,retry_after:60});
  if(table==='checkpoint_sessions')return options.method==='DELETE'?Response.json({message:'boom'},{status:500})
   :options.method?new Response(null,{status:204}):Response.json(u.searchParams.get('token_hash')==='eq.'+SESSION_HASH?[{username:'gir'}]:[]);
  if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun'}]);
  if(table==='checkpoint_credentials')return options.method?new Response(null,{status:201}):Response.json([]);
 });
 const quiet=console.error;console.error=()=>{};
 try{
  const response=await passphrase(post('/api/passphrase',{passphrase:PASSPHRASE,signOutOthers:true},COOKIE));
  assert.equal(response.status,200,'a committed write must not be reported as a failure');
  const payload=await response.json();
  assert.match(payload.recovery,/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/,'the code still arrives');
  assert.equal(payload.protected,true);
  assert.equal(payload.signedOutOthers,false,'and the answer says honestly that the other devices are still signed in');
  assert.ok(calls.find(call=>call.table==='checkpoint_credentials'&&call.method==='POST'),'the row really was written');
  assert.ok(calls.findIndex(call=>call.table==='checkpoint_credentials'&&call.method==='POST')<calls.findIndex(call=>call.table==='checkpoint_sessions'&&call.method==='DELETE'),'the write comes first; the optional work can only ever add to the answer');
 }finally{restore();console.error=quiet}
});
test('the parallel-guess window stays bounded by the rate limit, and one burst arms ONE lock',async()=>{
 // NOT closed, deliberately: a pre-check and an increment in a single statement would cost a round
 // trip on every sign-in. Every in-flight request reads locked_until from its own SELECT, so inside
 // one window as many guesses can derive as the limiter allows, and that number is TEN -- the limit in
 // rateLimit('enter:'+username,10,60,true). This test pins the ten so it cannot silently get worse.
 const credential=await row({failed_attempts:0,lock_level:0});
 const {calls,restore}=install((table,u,options)=>{
  if(table==='checkpoint_attempt')return Response.json({allowed:true,retry_after:60});
  if(table==='checkpoint_passphrase_result'){
   // mirrors supabase/migrations/005: the LEVEL sizes the lock, and a lock is armed only when nothing
   // is armed already, so ten simultaneous guesses cannot step the level ten times.
   const ok=JSON.parse(options.body).p_ok;
   const arming=!ok&&!credential.locked_until&&credential.failed_attempts+1>=5;
   if(arming)credential.lock_level+=1;
   if(ok)credential.locked_until=null;else if(arming)credential.locked_until=ahead(Math.min(900,60*2**(credential.lock_level-1))/60);
   credential.failed_attempts=ok?0:credential.failed_attempts+1;
   return Response.json({ok,failed_attempts:credential.failed_attempts,locked_until:credential.locked_until,lock_level:credential.lock_level});
  }
  if(table==='checkpoint_users')return Response.json([{username:'gir',display_name:'Varun'}]);
  if(table==='checkpoint_credentials')return options.method?new Response(null,{status:201}):Response.json([credential]);
 });
 try{
  const tries=await Promise.all(Array.from({length:10},(_,i)=>signin(post('/api/enter',{username:'gir',passphrase:'guess number '+i}))));
  assert.ok(tries.every(response=>response.status===401),'no guess may enter');
  assert.ok(results(calls).length<=10,'at most the 10-per-minute limit may derive inside one window, got '+results(calls).length);
  assert.equal(results(calls).length,10,'and none of them is free: every one is charged');
  assert.equal(credential.lock_level,1,'ten at once arm ONE 60-second lock, not ten escalations to the cap');
  assert.equal((await signin(post('/api/enter',{username:'gir',passphrase:PASSPHRASE}))).status,429);
  assert.equal(results(calls).length,10,'a locked account is not charged again');
 }finally{restore()}
});
