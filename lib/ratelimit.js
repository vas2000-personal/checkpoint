import {database,notMigrated} from './db.js';
import {redact} from './http.js';
import {bad} from './errors.js';
// Vercel functions share no memory, so the counter lives in the database: one upsert per attempt.
// A database without supabase/migrations/004 answers 404 with PGRST202 and simply does not limit,
// like the awake table. Any OTHER failure means the counter is unknown, which is a different thing:
// on an authentication path an unknown counter hands out unlimited guesses, so those callers pass
// strict and are refused instead. The Miss Log sync stays fail-open — a key holder syncing study
// minutes is not guessing a secret, and the family's board must not stop for a flaky counter.
// The POST is deliberately left on the no-retry default, so a retry can never double-count an attempt.
// `unavailable` is the copy a strict refusal carries, because the paths do not share one: a signed-in
// user changing a passphrase is not signing in, and telling them "Sign-in is briefly unavailable" is
// about a thing they are not doing.
export async function rateLimit(key,limit,windowSeconds,strict=false,unavailable='Sign-in is briefly unavailable. Please try again in a moment.'){
  let result;
  try{result=await database('rpc/checkpoint_attempt',{method:'POST',body:JSON.stringify({p_key:key,p_limit:limit,p_window_seconds:windowSeconds})})}
  catch(error){
    if(notMigrated(error))return;
    console.error('Rate limit check unavailable:',error.databaseStatus??error.name,error.databaseCode??'',redact(error.message));
    if(!strict)return;
    throw bad(unavailable,503,{retryAfter:30});
  }
  if(result&&result.allowed===false)throw bad('Too many attempts. Please wait a moment and try again.',429,{retryAfter:Number(result.retry_after)||60});
}
