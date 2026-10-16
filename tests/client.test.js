import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,mergePosts} from '../lib/client.js';

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
