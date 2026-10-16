import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,scrypt} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {hashPassphrase,verifyPassphrase,validatePassphrase,newRecoveryCode,normalizeRecoveryCode,recoveryHash,safeEqualHex,overlong,MAX_PASSPHRASE} from '../lib/passphrase.js';
import {redact} from '../lib/http.js';
// scrypt at N=16384 costs 50-100 ms a call, so the whole file derives at full cost five times
// (~0.5 s) and reuses one secret everywhere; the stored-parameter test derives at N=1024 instead.
const PASSPHRASE='the quiet bus',secret=hashPassphrase(PASSPHRASE);
const flip=(value,index)=>value.slice(0,index)+(value[index]==='0'?'1':'0')+value.slice(index+1);
test('a passphrase hashes to the scrypt string shape the SQL CHECK pins, and verifies',async()=>{
 const stored=await secret;
 assert.match(stored,/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
 assert.notEqual(stored,await hashPassphrase(PASSPHRASE),'a fresh salt per call, so two hashes never match');
 assert.equal(await verifyPassphrase(PASSPHRASE,stored),true);
});
test('a wrong passphrase, a tampered salt and a tampered key all verify false',async()=>{
 const stored=await secret,[,n,r,p,salt,key]=stored.split('$');
 assert.equal(await verifyPassphrase('the quiet bud',stored),false);
 assert.equal(await verifyPassphrase(PASSPHRASE,['scrypt',n,r,p,flip(salt,0),key].join('$')),false);
 assert.equal(await verifyPassphrase(PASSPHRASE,['scrypt',n,r,p,salt,flip(key,127)].join('$')),false);
 // A truncated key must not pass: scrypt ends in one PBKDF2 pass, whose shorter output is a prefix
 // of its longer one, so the 128-hex-digit length is what stops a 32-byte key verifying.
 assert.equal(await verifyPassphrase(PASSPHRASE,['scrypt',n,r,p,salt,key.slice(0,64)].join('$')),false);
});
test('a malformed secret returns false and never throws',async()=>{
 const stored=await secret,[,,,,salt,key]=stored.split('$');
 for(const bogus of ['','scrypt','not-a-secret',stored.slice(0,-1),stored+'0',stored.replace('scrypt','argon2'),
  ['scrypt','16384','8',salt,key].join('$'),['scrypt','0','8','1',salt,key].join('$'),['scrypt','16383','8','1',salt,key].join('$'),
  ['scrypt','99999999','8','1',salt,key].join('$'),['scrypt','16384','99','1',salt,key].join('$'),['scrypt','16384','8','1',salt.toUpperCase(),key].join('$'),
  null,undefined,42,{},['scrypt']])
  assert.equal(await verifyPassphrase(PASSPHRASE,bogus),false,String(bogus));
 assert.equal(await verifyPassphrase(null,stored),false);
});
test('verification honours the parameters stored in the secret, not the current constants',async()=>{
 const salt=Buffer.alloc(16,7),n=1024;
 const key=await new Promise((resolve,reject)=>scrypt(PASSPHRASE,salt,64,{N:n,r:8,p:1,maxmem:1<<24},(error,value)=>error?reject(error):resolve(value)));
 const cheap=`scrypt$${n}$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
 assert.equal(await verifyPassphrase(PASSPHRASE,cheap),true,'raising the cost later must not invalidate existing rows');
 assert.equal(await verifyPassphrase('wrong one',cheap),false);
});
test('validatePassphrase enforces 8-128 characters and keeps the value exactly as typed',()=>{
 assert.equal(validatePassphrase('eightchr','gir'),'eightchr');
 assert.equal(validatePassphrase('  spaced out  ','gir'),'  spaced out  ','leading and trailing spaces are part of the passphrase');
 assert.equal(validatePassphrase('a'.repeat(128),'gir').length,128);
 for(const value of ['','short','sevench',' '.repeat(7),'a'.repeat(129),null,undefined,42,{},['password123']])
  assert.throws(()=>validatePassphrase(value,'gir'),/8 to 128 characters/,String(value));
});
test('validatePassphrase NFKC-normalizes, so the stored form matches what any keyboard produces',()=>{
 // Length is counted after normalizing: eight halfwidth katakana compose to four characters.
 assert.throws(()=>validatePassphrase('ﾊﾟ'.repeat(4),'gir'),/8 to 128 characters/);
 assert.equal(validatePassphrase('ﬁreﬂy lane','gir'),'firefly lane');
 assert.equal(validatePassphrase('ｐａｓｓｗｏｒｄｓ','gir'),'passwords');
 // Normalizing before the deny-list, or a fullwidth "password" would slip straight past it.
 assert.throws(()=>validatePassphrase('ｐａｓｓｗｏｒｄ','gir'),/too easy to guess/);
});
test('validatePassphrase rejects the username and the obvious deny-list',()=>{
 assert.throws(()=>validatePassphrase('girgirgir','girgirgir'),/cannot be your username/);
 assert.throws(()=>validatePassphrase('GIRGIRGIR','girgirgir'),/cannot be your username/);
 assert.equal(validatePassphrase('girgirgir','gir'),'girgirgir','only an exact match is the username');
 for(const value of ['password','PASSWORD','12345678','Checkpoint','letmein1','00000000'])
  assert.throws(()=>validatePassphrase(value,'gir'),/too easy to guess/,value);
});
test('a recovery code is 80 bits in five groups of four, and hashes the same however it is typed',()=>{
 const code=newRecoveryCode();
 assert.match(code,/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
 assert.equal(code.replace(/-/g,'').length,20);
 assert.equal(new Set(Array.from({length:20},newRecoveryCode)).size,20,'randomBytes, not a counter');
 const bare=code.replace(/-/g,'').toLowerCase();
 assert.equal(normalizeRecoveryCode(code),bare);
 assert.equal(normalizeRecoveryCode(' '+code.toLowerCase()+' '),bare);
 assert.equal(normalizeRecoveryCode(bare.toUpperCase()),bare);
 assert.equal(normalizeRecoveryCode(null),'');
 assert.match(recoveryHash(code),/^[0-9a-f]{64}$/,'the shape the recovery_hash CHECK pins');
 assert.equal(recoveryHash(code),createHash('sha256').update(bare).digest('hex'));
 assert.equal(recoveryHash(bare),recoveryHash(code));
 assert.notEqual(recoveryHash(newRecoveryCode()),recoveryHash(code));
});
test('safeEqualHex matches only equal-length hex, and never throws on junk',()=>{
 const a=recoveryHash('AAAA-BBBB-CCCC-DDDD-EEEE');
 assert.equal(safeEqualHex(a,a),true);
 assert.equal(safeEqualHex(a,recoveryHash('AAAA-BBBB-CCCC-DDDD-EEEF')),false);
 for(const [x,y] of [[a,a.slice(0,-1)],[a,a.toUpperCase()],[a,''],['',''],['abc','abd'],[a,null],[null,a],[42,42],[a,undefined]])
  assert.equal(safeEqualHex(x,y),false,String(x)+' '+String(y));
});
test('nothing longer than the setter accepts reaches scrypt at all',async()=>{
 const stored=await secret;
 assert.equal(overlong('a'.repeat(MAX_PASSPHRASE)),false);
 assert.equal(overlong('a'.repeat(MAX_PASSPHRASE+1)),true);
 // NFKC can shrink as well as grow, so the exact cap is counted after normalizing: 384 halfwidth
 // katakana compose to 192 characters, which is over the cap even though a raw count would pass.
 assert.equal(overlong('a'.repeat(1024)),true);
 assert.equal(overlong(null),true);assert.equal(overlong(42),true);
 // A 4 MiB passphrase used to be normalized and derived. It cannot match any stored secret, so the
 // only correct answer is false, and it has to arrive without asking scrypt for its 18 MB.
 const started=Date.now();
 assert.equal(await verifyPassphrase('x'.repeat(4*1024*1024),stored),false);
 assert.ok(Date.now()-started<50,'refused without deriving, not after');
 assert.equal(await verifyPassphrase('a'.repeat(MAX_PASSPHRASE+1),stored),false);
});
test('redact knows the shapes a CHECK violation echoes back',async()=>{
 const stored=await secret,code=newRecoveryCode();
 // A CHECK violation quotes the offending row, so the PostgREST body lib/db.js logs can carry the
 // whole scrypt string and the recovery hash. Neither may reach a log line.
 const body=`new row for relation "checkpoint_credentials" violates check constraint: (gir, ${stored}, ${recoveryHash(code)}, 0)`;
 const clean=redact(body);
 assert.ok(!clean.includes(stored),'the scrypt secret must not be logged');
 assert.ok(!clean.includes(stored.split('$').at(-1)),'nor the derived key on its own');
 assert.ok(!clean.includes(recoveryHash(code)),'nor the recovery hash');
 assert.ok(clean.includes('checkpoint_credentials'),'the diagnostic itself still reads');
 assert.equal(redact('token_hash='+'a'.repeat(64)),'token_hash=[redacted]');
 assert.equal(redact('scrypt'),'scrypt','an ordinary word is not a secret');
});
test('migration 005 is transactional, and nothing reads created_at to authorise a change',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/005_passphrases.sql',import.meta.url),'utf8');
 // A copy of this file with the begin/commit stripped left checkpoint_credentials reachable over the
 // anon REST API, with every secret in it, if the run failed before the revoke. There is one file.
 assert.ok(!existsSync(new URL('../supabase/passphrases.sql',import.meta.url)),'the non-transactional copy must not come back');
 assert.match(sql,/^begin;/);
 assert.match(sql,/commit;\s*$/);
 const begin=sql.indexOf('begin;'),commit=sql.indexOf('commit;');
 for(const statement of ['create table if not exists public.checkpoint_credentials','revoke all on public.checkpoint_credentials from public,anon,authenticated'])
  assert.ok(sql.indexOf(statement)>begin&&sql.indexOf(statement)<commit,statement+' must be inside the transaction');
 // Seniority is gone: created_at survives as an audit column and the SQL says so.
 assert.match(sql,/Audit only, NOT load-bearing/);
 assert.ok(!/LOAD-BEARING/.test(sql),'nothing may still claim the column decides anything');
 assert.match(sql,/needs the current passphrase or the recovery code/);
 // The strike count still decays once a lock has run out, or one later typo relocks the owner at the
 // cap. What changed is that it no longer SIZES the lock: a count that decays to 1 could never push
 // failed_attempts+1-5 above 0, so the lock was a flat 60 s for ever and the documented doubling to
 // 900 s never happened. An escalation level does the sizing now, and only a success clears it.
 assert.match(sql,/when locked_until is not null and locked_until<=now\(\) then 1/);
 assert.match(sql,/when locked_until<=now\(\) then null/);
 assert.match(sql,/when locked_until is null and failed_attempts\+1>=5 then lock_level\+1/);
 assert.match(sql,/least\(900,60\*power\(2,lock_level\)\)/,'the lock is sized from the escalation level');
 assert.ok(!/power\(2,failed_attempts/.test(sql),'and never again from the decayed strike count');
 // A lock is armed only when nothing is armed already, or a parallel burst steps the level per request.
 assert.match(sql,/when locked_until is null and failed_attempts\+1>=5 then now\(\)/);
 // TWO meters. One shared counter let anybody who knows the public username burn wrong recovery codes
 // until the lock that gates the PASSPHRASE sat at 15 minutes, indefinitely.
 assert.match(sql,/if p_factor='recovery' then/);
 assert.match(sql,/least\(900,60\*power\(2,recovery_lock_level\)\)/);
 for(const column of ['lock_level','recovery_failed_attempts','recovery_locked_until','recovery_lock_level']){
  assert.ok(sql.includes(column+' integer not null default 0')||sql.includes(column+' timestamptz'),column+' must be declared');
  assert.ok(sql.includes('add column if not exists '+column),column+' must also reach a database that already has the table');
 }
 // PostgreSQL keeps both overloads otherwise, and then a two-argument call is ambiguous.
 assert.match(sql,/drop function if exists public\.checkpoint_passphrase_result\(text,boolean\);/);
 assert.ok(sql.indexOf('drop function if exists public.checkpoint_passphrase_result(text,boolean);')<sql.indexOf('create or replace function public.checkpoint_passphrase_result'));
 assert.match(sql,/grant execute on function public\.checkpoint_passphrase_result\(text,boolean,text\) to service_role/);
 assert.match(sql,/delete from public\.checkpoint_credentials where username='gir';/,'the operator escape hatch stays documented');
});

test('the README documents the backoff and the two meters that the SQL actually implements',()=>{
 const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 // The paragraph used to promise "a doubling backoff capped at 15 minutes", which the decay had
 // silently reduced to a flat 60 s. Documentation that describes a backoff nobody gets is worse than
 // none, so this pins the README to the shape the migration now has.
 assert.match(readme,/escalation level/,'the README must name what sizes the lock');
 assert.match(readme,/60 s, 2 min, 4 min, 8 min and then 15 min/,'and state the actual waits');
 assert.match(readme,/only a \*correct\* attempt clears the level/);
 assert.match(readme,/metered \*\*separately\*\*/,'the two meters have to be documented');
 assert.ok(!/with a doubling backoff capped at 15 minutes/.test(readme),'the claim that was never true must not come back');
 // The accepted residue is stated, not hidden.
 assert.match(readme,/What is still accepted is narrower/);
 // And the parallel window, with its number.
 assert.match(readme,/that number is ten/);
});
