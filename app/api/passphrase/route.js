import {database,json,fail,rateLimit,readBody,sameOrigin,notMigrated} from '../../../lib/server.js';
import {currentUser,revokeOtherSessions} from '../../../lib/sessions.js';
import {hashPassphrase,verifyPassphrase,validatePassphrase,newRecoveryCode,recoveryHash,safeEqualHex} from '../../../lib/passphrase.js';
const lockWait=until=>{const minutes=Math.max(1,Math.ceil((Date.parse(until)-Date.now())/60000));return `${minutes} minute${minutes===1?'':'s'}`};
// A database without supabase/migrations/005 has no table (PGRST205) and the account is simply not
// enrolled. Any other 404 is a fault and must not read as "no passphrase set", or a stale schema
// cache would let a passing visitor enroll a passphrase over somebody else's.
const credentialFor=async username=>{
 try{return (await database('checkpoint_credentials?'+new URLSearchParams({select:'secret,recovery_hash,locked_until,recovery_locked_until',username:'eq.'+username,limit:'1'})))[0]||null}
 catch(error){if(notMigrated(error))return null;throw error}
};
// Never fatal, exactly as in the enter route: a failed bookkeeping write must not refuse a caller
// who typed the right passphrase. The factor names WHICH meter is charged: a wrong recovery code must
// not be allowed to grow the lock that gates the passphrase (see supabase/migrations/005).
const record=(username,ok,factor)=>database('rpc/checkpoint_passphrase_result',{method:'POST',body:JSON.stringify({p_username:username,p_ok:ok,p_factor:factor})}).catch(error=>console.error('Passphrase attempt not recorded:',username,factor,error.databaseStatus??error.name));
const locked=until=>!!(until&&Date.parse(until)>Date.now());
// The credential row is already committed by the time this runs and `payload` holds the one-time
// recovery code, so the optional extra can only ever ADD to the answer. revokeOtherSessions swallows
// its own failure; signedOutOthers reports whether it actually happened.
const written=async(request,username,body,payload)=>body.signOutOthers===true?json({...payload,signedOutOthers:await revokeOtherSessions(request,username)}):json(payload);
// Read-only state for Settings, so the public board payload never has to carry an enrolled flag.
export async function GET(request){
 try{
  const user=await currentUser(request);if(!user)return json({error:'Please sign in.'},401);
  return json({protected:!!await credentialFor(user.username)});
 }catch(error){return fail(error)}
}
export async function POST(request){
 if(!sameOrigin(request))return json({error:'Open Checkpoint to change your passphrase.'},403);
 try{
  const user=await currentUser(request);if(!user)return json({error:'Please sign in.'},401);
  const body=await readBody(request);
  const setting=body.passphrase!==undefined&&body.passphrase!==null&&body.passphrase!=='',removing=body.remove===true;
  if(!setting&&!removing)return json({error:'Choose a passphrase to set or remove.'},400);
  const credential=await credentialFor(user.username);
  if(!credential&&removing)return json({error:'This username has no passphrase to remove.'},400);
  // Two limits that guard different things: rateLimit caps how fast THIS signed-in device may guess,
  // and the RPC's per-credential counter locks the ACCOUNT however many devices are guessing at it.
  // strict: an unavailable counter must not become unlimited guesses at somebody's passphrase.
  // Not "sign-in is unavailable": the caller is already signed in and is changing a passphrase.
  await rateLimit('passphrase:'+user.username,10,60,true,'Your passphrase cannot be changed right now. Please try again in a moment.');
  if(credential){
   // The CURRENT PASSPHRASE or the RECOVERY CODE, and nothing else. A live session is not authority
   // over the credential: usernames are public, so anyone may hold a 180-day cookie for a name they
   // do not own, and letting that cookie rewrite the passphrase would be a permanent master key over
   // every future enrollment of it. The session still reads and posts with no friction — it simply
   // cannot change the secret. If both the passphrase and the code are lost, the only way back is
   // the operator deleting the row (the escape hatch commented in supabase/migrations/005).
   const offered=typeof body.current==='string'&&body.current!==''||typeof body.recovery==='string'&&body.recovery.trim()!=='';
   let allowed=false;
   if(typeof body.recovery==='string'&&body.recovery.trim()){
    // A recovery code works while the account is locked out: it is the way back in, not a guess.
    // Charged to the counter when it is wrong, so guessing 80 bits here is metered like a passphrase.
     // Metered on its OWN counter, and gated by it. A shared counter let anyone who knows the public
    // username burn wrong codes until the PASSPHRASE was locked for fifteen minutes; 80 bits still
    // has to be metered, so the recovery lock gates the recovery factor and nothing else.
    if(locked(credential.recovery_locked_until))return json({error:`Too many recovery-code tries. Try again in ${lockWait(credential.recovery_locked_until)}.`},429);
    if(!safeEqualHex(recoveryHash(body.recovery),credential.recovery_hash)){await record(user.username,false,'recovery');return json({error:'That recovery code does not match.'},403)}
    allowed=true;
   }
   if(!allowed&&typeof body.current==='string'&&body.current){
    // Refused from the select, before any derivation: a locked account costs a query, not CPU.
    if(locked(credential.locked_until))return json({error:`Too many tries. Try again in ${lockWait(credential.locked_until)}.`},429);
    // Charged BEFORE the work, so parallel guesses are counted instead of all clearing one
    // pre-check together; the success afterwards is what clears the counter and the lockout.
    await record(user.username,false,'passphrase');
    allowed=await verifyPassphrase(body.current,credential.secret);
    if(!allowed)return json({error:'That passphrase does not match.'},403);
    await record(user.username,true,'passphrase');
   }
   // Nothing offered at all is a stale UI that thinks the account is un-enrolled, which is a
   // different answer from an authorisation that was tried and failed.
   if(!allowed)return setting&&!offered?json({error:'This username already has a passphrase. Change it from Settings.'},409):json({error:'Enter your current passphrase, or the recovery code you saved, to change it.'},403);
  }
  if(removing){
   await database('checkpoint_credentials?'+new URLSearchParams({username:'eq.'+user.username}),{method:'DELETE',headers:{Prefer:'return=minimal'}});
   return await written(request,user.username,body,{ok:true,protected:false});
  }
  const passphrase=validatePassphrase(body.passphrase,user.username),recovery=newRecoveryCode();
  const secret=await hashPassphrase(passphrase),now=new Date().toISOString();
  if(credential)
   // created_at is left alone: it is a plain audit column now, and a change that rewrote it once
   // inverted the comparison it used to feed, which made every older session senior instead of junior.
   await database('checkpoint_credentials?'+new URLSearchParams({username:'eq.'+user.username}),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({secret,recovery_hash:recoveryHash(recovery),failed_attempts:0,locked_until:null,lock_level:0,recovery_failed_attempts:0,recovery_locked_until:null,recovery_lock_level:0,updated_at:now})});
  else
   await database('checkpoint_credentials',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({username:user.username,secret,recovery_hash:recoveryHash(recovery),created_at:now,updated_at:now})});
  // Shown once and never retrievable: only its sha256 is stored.
  return await written(request,user.username,body,{ok:true,protected:true,recovery});
 }catch(error){return fail(error)}
}
