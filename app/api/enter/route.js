import {database,json,fail,rateLimit,readBody,sameOrigin,validateUsername,notMigrated} from '../../../lib/server.js';
import {issueSession} from '../../../lib/sessions.js';
import {verifyPassphrase,recoveryHash,safeEqualHex} from '../../../lib/passphrase.js';
const lockWait=until=>{const minutes=Math.max(1,Math.ceil((Date.parse(until)-Date.now())/60000));return `${minutes} minute${minutes===1?'':'s'}`};
const locked=until=>!!(until&&Date.parse(until)>Date.now());
// A database without supabase/migrations/005 has no table, which PostgREST reports as PGRST205, and
// the username enters the way it always has: shipping this code before the SQL must never lock the
// family out of the board. ONLY that code. A stale schema cache, a paused project, a replica or a
// gateway also answer 404, and treating those as "not enrolled" would make every enrolled account
// enterable by username alone — a silent global bypass, so it is logged loudly and fails closed.
const credentialFor=async username=>{
  try{return (await database('checkpoint_credentials?'+new URLSearchParams({select:'secret,recovery_hash,locked_until,recovery_locked_until',username:'eq.'+username,limit:'1'})))[0]||null}
  catch(error){
    if(!notMigrated(error))throw error;
    console.error('PASSPHRASE CHECK BYPASSED: checkpoint_credentials does not exist, so every username enters by name alone. Apply supabase/migrations/005_passphrases.sql.',error.databaseCode);
    return null;
  }
};
// Never fatal: this counter is defense in depth behind the 10-per-minute rate limit above, so a
// failed bookkeeping write must not refuse a caller who typed the right passphrase. The factor names
// WHICH meter is charged: one shared counter let anybody who knows the public username burn wrong
// RECOVERY codes to grow the lock that gates the PASSPHRASE, and the owner's correct passphrase then
// answered 429 for fifteen minutes, indefinitely (see supabase/migrations/005).
const record=(username,ok,factor)=>database('rpc/checkpoint_passphrase_result',{method:'POST',body:JSON.stringify({p_username:username,p_ok:ok,p_factor:factor})}).catch(error=>console.error('Passphrase attempt not recorded:',username,factor,error.databaseStatus??error.name));
const entered=(user,extra)=>issueSession(user.username).then(cookie=>{const response=json({user,...extra});response.headers.set('Set-Cookie',cookie);return response});
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to sign in.'},403);
  try {
    const body=await readBody(request),username=validateUsername(body.username);
    // strict: an unavailable counter must not become unlimited guesses at somebody's passphrase.
    await rateLimit('enter:'+username,10,60,true);
    const users=await database('checkpoint_users?'+new URLSearchParams({select:'username,display_name',username:`eq.${username}`,limit:'1'}));
    if(!users.length)return json({error:'That username does not exist yet. Choose New user to create it.'},404);
    const credential=await credentialFor(username);
    // Accepted deliberately: this answer reveals whether a username is enrolled. The alternative —
    // prompting for a passphrase on an un-enrolled name and then accepting anything — trains people
    // to type their secrets into a field that does not check them.
    if(!credential)return await entered(users[0],{enroll:true});
    // Ahead of the PASSPHRASE lockout, exactly as in /api/passphrase: a recovery code is the way back
    // in, not a guess. It is the only documented route for a signed-out owner on a new device, so five
    // passphrase typos must not take it away for fifteen minutes. A wrong code is charged to its own
    // meter and gated by its own lock, so burning codes can no longer deny the passphrase path.
    if(typeof body.recovery==='string'&&body.recovery.trim()){
      if(locked(credential.recovery_locked_until))return json({error:`Too many recovery-code tries. Try again in ${lockWait(credential.recovery_locked_until)}.`,needsPassphrase:true},429);
      if(!safeEqualHex(recoveryHash(body.recovery),credential.recovery_hash)){await record(username,false,'recovery');return json({error:'That recovery code does not match.',needsPassphrase:true},401)}
      // Honestly back to username-only rather than parked half-locked: the row goes, and Settings
      // offers enrollment again on the next visit.
      await database('checkpoint_credentials?'+new URLSearchParams({username:'eq.'+username}),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return await entered(users[0],{mustReset:true});
    }
    if(typeof body.passphrase!=='string'||!body.passphrase)return json({error:'This username is protected by a passphrase.',needsPassphrase:true},401);
    // Read from the select, refused before any derivation: a locked account costs a query, not CPU.
    if(locked(credential.locked_until))return json({error:`Too many tries. Try again in ${lockWait(credential.locked_until)}.`,needsPassphrase:true},429);
    // Charged BEFORE the work, so a burst of parallel guesses is counted instead of all of them
    // clearing one pre-check together. The success below is what clears the counter and the lockout,
    // which is why a correct passphrase posts twice.
    await record(username,false,'passphrase');
    const ok=await verifyPassphrase(body.passphrase,credential.secret);
    if(!ok)return json({error:'That passphrase does not match.',needsPassphrase:true},401);
    await record(username,true,'passphrase');
    return await entered(users[0],{});
  }catch(error){return fail(error)}
}
