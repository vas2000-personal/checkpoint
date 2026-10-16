import {database} from './db.js';
import {redact} from './http.js';
import {bad} from './errors.js';
// Vercel functions share no memory, so the counter lives in the database: one upsert per attempt.
// A database without supabase/migrations/004 answers 404 and simply does not limit, like the awake table.
// The POST is deliberately left on the no-retry default, so a retry can never double-count an attempt.
export async function rateLimit(key,limit,windowSeconds){
  let result;
  try{result=await database('rpc/checkpoint_attempt',{method:'POST',body:JSON.stringify({p_key:key,p_limit:limit,p_window_seconds:windowSeconds})})}
  catch(error){if(error.databaseStatus!==404)console.error('Rate limit check unavailable:',error.databaseStatus??error.name,redact(error.message));return}
  if(result&&result.allowed===false)throw bad('Too many attempts. Please wait a moment and try again.',429,{retryAfter:Number(result.retry_after)||60});
}
