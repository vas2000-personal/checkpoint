import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {api,mergePosts} from '../lib/client.js';
const component=name=>readFileSync(new URL('../components/'+name,import.meta.url),'utf8');

const UNREACHABLE='The board could not be reached. Please try again.';
const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function stub(...answers) {
  const calls=[];
  globalThis.fetch=async(path,options)=>{calls.push({path,options});const next=answers[Math.min(calls.length-1,answers.length-1)];if(next instanceof Error)throw next;return next};
  return calls;
}
const network=()=>new TypeError('Failed to fetch');
const timedOut=()=>Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
const caught=async promise=>{try{await promise;assert.fail('expected a rejection')}catch(error){return error}};

test('api returns the parsed body and aborts on a timeout signal',async()=>{
  const calls=stub(json({ok:true}));
  assert.deepEqual(await api('/api/board'),{ok:true});
  assert.equal(calls[0].options.method,'GET');
  assert.ok(calls[0].options.signal instanceof AbortSignal,'a timeout signal is always passed');
});

test('api posts a JSON body and never retries a POST',async()=>{
  const calls=stub(json({saved:true}));
  assert.deepEqual(await api('/api/posts',{message:'hi'}),{saved:true});
  assert.equal(calls[0].options.method,'POST');
  assert.equal(JSON.parse(calls[0].options.body).message,'hi');
  const failing=stub(network());
  const error=await caught(api('/api/posts',{message:'hi'}));
  assert.equal(failing.length,1);
  assert.equal(error.message,UNREACHABLE);
  assert.equal(error.status,0);
});

test('a server error carries its status and parsed body',async()=>{
  stub(json({error:'That username does not exist yet. Choose New user to create it.'},404));
  const error=await caught(api('/api/enter',{username:'gir'}));
  assert.equal(error.message,'That username does not exist yet. Choose New user to create it.');
  assert.equal(error.status,404);
  assert.deepEqual(error.body,{error:'That username does not exist yet. Choose New user to create it.'});
});

test('a server error with no message falls back to the generic retry copy',async()=>{
  stub(json({},500));
  const error=await caught(api('/api/board'));
  assert.equal(error.message,'Please try again.');
  assert.equal(error.status,500);
});

test('an unparseable response reads as unreachable but keeps the status',async()=>{
  stub({ok:false,status:502,json:async()=>{throw new SyntaxError('Unexpected token <')}});
  const error=await caught(api('/api/board'));
  assert.equal(error.message,UNREACHABLE);
  assert.equal(error.status,502);
});

test('a GET is retried once on a pure network error',async()=>{
  const calls=stub(network(),json({ok:true}));
  assert.deepEqual(await api('/api/board'),{ok:true});
  assert.equal(calls.length,2);
  const twice=stub(network(),network());
  const error=await caught(api('/api/board'));
  assert.equal(twice.length,2);
  assert.equal(error.message,UNREACHABLE);
  assert.equal(error.status,0);
});

test('a timeout surfaces immediately rather than waiting through a second one',async()=>{
  const calls=stub(timedOut());
  const error=await caught(api('/api/board'));
  assert.equal(calls.length,1);
  assert.equal(error.message,UNREACHABLE);
  assert.equal(error.status,0);
});

const post=(id,minutes)=>({id,study:{minutes}});

test('a background refresh keeps paged-in history and prefers the fresh copy of a post',()=>{
  const kept=[post('c',1),post('b',1),post('a',1)];
  const merged=mergePosts(kept,[post('d',1),post('c',9)],false);
  assert.deepEqual(merged.map(entry=>entry.id),['d','c','b','a']);
  assert.equal(merged[1].study.minutes,9,'the refreshed copy of c wins');
});

test('Earlier chapters appends older posts without duplicating what is loaded',()=>{
  const kept=[post('c',1),post('b',1)];
  assert.deepEqual(mergePosts(kept,[post('b',1),post('a',1)],true).map(entry=>entry.id),['c','b','a']);
});

test('merging into an empty list is just the incoming page',()=>{
  assert.deepEqual(mergePosts([],[post('b',1),post('a',1)],false).map(entry=>entry.id),['b','a']);
  assert.deepEqual(mergePosts([],[post('b',1)],true).map(entry=>entry.id),['b']);
});

test('a one-time recovery code is stashed on arrival and cleared only by the acknowledgement',()=>{
 // Three ways the code used to be lost for good, all DRIVEN: a 502 from an optional follow-up write
 // after the row was committed; a response dropped in flight; and Escape, which Chromium's
 // close-watcher abuse protection let through on the third press whatever onCancel said -- while the
 // in-dialog brand link and a plain reload walked past it anyway. The stash fixes the class, which is
 // why nothing here tries to hold the screen shut any more.
 const dialog=component('entry-dialog.jsx');
 assert.match(dialog,/sessionStorage\.setItem\(codeKey/,'the code is stashed the moment it arrives');
 assert.match(dialog,/holdRecoveryCode\(name,result\.recovery\)/,'on the sign-in route');
 assert.match(dialog,/holdRecoveryCode\(account,result\.recovery\)/,'and on the enrollment route');
 assert.equal((dialog.match(/forgetRecoveryCode\(account\)/g)||[]).length,1,'exactly one thing clears it');
 assert.match(dialog,/function acknowledge\(\)\{forgetRecoveryCode\(account\)/,"and that thing is \"I've saved it\"");
 assert.match(dialog,/onClick=\{acknowledge\}>I\u2019ve saved it/);
 assert.ok(!/onCancel=/.test(dialog),'Escape is no longer fought');
 assert.ok(!/recovery-code" && <button[^>]*className="close"/.test(dialog),'and the close button is on every step, including that one');
 assert.match(dialog,/const held=heldRecoveryCode\(who\);/,'reopening the dialog puts an unacknowledged code back');
 assert.match(dialog,/setStep\(held\?'recovery-code'/);
 assert.match(dialog,/which issues a fresh code/,'and the copy says a lost code is not fatal while the passphrase is known');
});
test('an unacknowledged code survives a reload, and only in the tab that minted it',()=>{
 const dialog=component('entry-dialog.jsx'),dash=component('dashboard.jsx');
 assert.match(dash,/if\(user&&heldRecoveryCode\(user\)\)entryRef\.current\?\.open\('change',user\)/,'a reload re-shows it');
 // sessionStorage, not localStorage: it dies with the tab, so an ordinary visitor on the same device
 // never meets it and the owner's acceptance test is untouched.
 assert.match(dialog,/sessionStorage\.getItem\(codeKey/);
 assert.ok(!/localStorage\.(set|get)Item\(codeKey/.test(dialog),'the code must not outlive the tab');
});
test('the enrollment form names what it asks for and always has a way back',()=>{
 const dialog=component('entry-dialog.jsx');
 // It used to carry the OFFER's heading, "Keep this username yours?", and its only controls were the
 // close X and "Save passphrase": Back was gated on being enrolled, so there was no way to the offer.
 assert.match(dialog,/adding\?'Add your passphrase\.':'Keep this username yours\?'/);
 assert.match(dialog,/step === "enroll" && adding && <p className="pass-skip">/,'Back is no longer gated on enrolled');
 assert.match(dialog,/if\(enrolled\)setStep\("manage"\);else setAdding\(false\)/,'and it reaches the offer when there is nothing to manage');
});
test('the sign-in card fetches lazily, names itself once, and never renders for a signed-out reader',()=>{
 const dash=component('dashboard.jsx');
 // GET /api/passphrase is a checkpoint_credentials read. Firing it on mount put that read on the
 // critical path of every signed-in page view, which is the opposite of why the enrolled flag was kept
 // out of the public board payload.
 assert.match(dash,/useEffect\(\(\)=>\{if\(!open\)return;[^\n]*api\('\/api\/passphrase'\)/,'the fetch waits for the control to be opened');
 assert.match(dash,/box\.addEventListener\('toggle',sync\)/,'and the native toggle is the trigger, so a remembered-open widget still fetches');
 assert.ok(!/useEffect\(\(\)=>\{let live=true;setError\(''\);api\('\/api\/passphrase'\)/.test(dash),'never on mount again');
 assert.equal((dash.match(/Your sign-in/g)||[]).length,1,'the label is printed once, not in the summary and the card both');
 assert.match(dash,/\{user&&board\?\.selectedUsername===user&&<>[\s\S]*<SignInCard/,'a signed-out reader renders no card, so it issues no GET either');
});
