import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {bad} from './errors.js';
const N=16384,R=8,P=1,KEY_BYTES=64,SALT_BYTES=16;
const SECRET=/^scrypt\$(\d{1,7})\$(\d{1,3})\$(\d{1,3})\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
// OpenSSL rejects a derivation when 128*r*(N+p+2) exceeds maxmem, and node's default 32 MB leaves no
// room to raise the cost later, so every call states its own budget with 1 MB of headroom.
// Always the async scrypt: a Vercel function's event loop has to stay free for the other requests.
const scryptKey=(passphrase,salt,n,r,p)=>new Promise((resolve,reject)=>scrypt(passphrase.normalize('NFKC'),salt,KEY_BYTES,{N:n,r,p,maxmem:128*r*(n+p+2)+1048576},(error,key)=>error?reject(error):resolve(key)));
// N=16384 asks about 18 MB a call and nothing else bounds how many requests derive at once, so a
// burst of sign-ins could ask one function instance for more memory than it has. Four at a time is
// ~72 MB; the rest queue, and the per-username rate limit is what keeps that queue short.
const MAX_INFLIGHT=4;let inflight=0;const waiting=[];
const acquire=()=>inflight<MAX_INFLIGHT?(inflight++,Promise.resolve()):new Promise(resolve=>waiting.push(resolve));
const release=()=>{const next=waiting.shift();if(next)next();else inflight--};
const derive=async(passphrase,salt,n,r,p)=>{await acquire();try{return await scryptKey(passphrase,salt,n,r,p)}finally{release()}};
export const MAX_PASSPHRASE=128;
// Nothing longer than the setter's cap can ever match a stored secret, so a verifier must refuse it
// before scrypt asks for its 18 MB. NFKC can shrink a string (three Hangul jamo compose to one
// syllable), so the cheap raw ceiling is generous and the exact cap is checked after normalizing.
export const overlong=value=>typeof value!=='string'||value.length>MAX_PASSPHRASE*8||value.normalize('NFKC').length>MAX_PASSPHRASE;
export async function hashPassphrase(passphrase) {
 const salt=randomBytes(SALT_BYTES),key=await derive(String(passphrase),salt,N,R,P);
 return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}
// Re-derives with the parameters stored in the secret, never the constants above, so raising the cost
// leaves every existing row verifiable. A row is server-written, but an unbounded stored N would still
// ask for gigabytes of maxmem, so the ceilings below bound the work one row can demand.
export async function verifyPassphrase(passphrase,secret) {
 try{
  // The length cap belongs here, at the only place that derives: a caller cannot forget it, and a
  // passphrase longer than the setter accepts is wrong by definition rather than expensive to check.
  if(overlong(passphrase)||typeof secret!=='string')return false;
  const parts=SECRET.exec(secret);if(!parts)return false;
  const n=Number(parts[1]),r=Number(parts[2]),p=Number(parts[3]);
  if(n<2||r<1||p<1||n>65536||r>16||p>4||(n&(n-1))!==0)return false;
  const stored=Buffer.from(parts[5],'hex'),key=await derive(passphrase,Buffer.from(parts[4],'hex'),n,r,p);
  return key.length===stored.length&&timingSafeEqual(key,stored);
 }catch{return false}
}
// A courtesy, not a security control: the deny-list only has to catch what someone types to get past
// the form, and 5-strike lockout plus an 80-bit recovery code is what actually guards the account.
const OBVIOUS=new Set(['password','password1','passphrase','12345678','123456789','1234567890','qwertyui','qwerty123','iloveyou','letmein1','checkpoint','abcd1234','00000000','11111111']);
export function validatePassphrase(value,username) {
 // Not trimmed: a typed passphrase is exactly what was typed, leading and trailing spaces included.
 const passphrase=typeof value==='string'?value.normalize('NFKC'):'';
 if(passphrase.length<8||passphrase.length>MAX_PASSPHRASE)throw bad('Choose a passphrase of 8 to 128 characters.',400);
 if(typeof username==='string'&&passphrase.toLowerCase()===username.trim().toLowerCase())throw bad('Your passphrase cannot be your username.',400);
 if(OBVIOUS.has(passphrase.toLowerCase()))throw bad('That passphrase is too easy to guess. Please choose another one.',400);
 return passphrase;
}
// 80 bits of randomness needs no scrypt, so a recovery code is hashed the way the repo already hashes
// API keys and session tokens: a slow KDF buys nothing against a value no one can guess. Grouped for
// reading aloud; the normalizer takes it back in any shape.
export const RECOVERY_HEX=20;
export const newRecoveryCode=()=>randomBytes(RECOVERY_HEX/2).toString('hex').toUpperCase().match(/.{4}/g).join('-');
export const normalizeRecoveryCode=value=>typeof value==='string'?value.replace(/[\s-]/g,'').toLowerCase():'';
// Only a value shaped like a code we minted is ever hashed. That rejects junk a keystroke earlier, and
// it is also what keeps a user-CHOSEN secret out of here: a passphrase cannot be exactly 20 hex
// characters by accident, and the fast hash is only ever applied to our own random tokens.
// CodeQL reads body.recovery as a password because it is a sibling of body.passphrase on the same
// route, and then objects to sha256. It is the right objection for a human-chosen secret and the wrong
// one for 80 bits of randomness this server generated: scrypt here would add latency and protect
// nothing, which is why session tokens and Miss Log keys are hashed the same way. The passphrase
// itself goes through hashPassphrase above, which is scrypt.
// codeql[js/insufficient-password-hash]
export const recoveryHash=code=>{const bare=normalizeRecoveryCode(code);return new RegExp('^[0-9a-f]{'+RECOVERY_HEX+'}$').test(bare)?createHash('sha256').update(bare).digest('hex'):''};
export function safeEqualHex(a,b) {
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||a.length===0||a.length%2||!/^[0-9a-f]+$/.test(a)||!/^[0-9a-f]+$/.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
