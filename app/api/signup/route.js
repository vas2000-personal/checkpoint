import {database,json,fail,rateLimit,readBody,sameOrigin,validateUsername} from '../../../lib/server.js';
import {issueSession} from '../../../lib/sessions.js';
import {hashPassphrase,validatePassphrase,newRecoveryCode,recoveryHash} from '../../../lib/passphrase.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to create a user.'},403);
  try {
    const body=await readBody(request),username=validateUsername(body.username);
    const displayName=typeof body.displayName==='string'?body.displayName.trim()||username:username;
    if(displayName.length>60)return json({error:'Keep your display name under 60 characters.'},400);
    // Optional, and an empty field means no passphrase. Validation is sync and free, so a rejected
    // one costs no rate-limit quota; the scrypt derivation waits until after the limit.
    const asked=body.passphrase!==undefined&&body.passphrase!==null&&body.passphrase!=='';
    const passphrase=asked?validatePassphrase(body.passphrase,username):null;
    // strict: an unavailable counter must not become an unlimited username-and-scrypt generator.
    await rateLimit('signup:'+username,5,60,true);
    // Hashed before the checkpoint_users insert, so a rejected or failing passphrase can never
    // strand a half-created account behind "already taken".
    const secret=asked?await hashPassphrase(passphrase):null,recovery=asked?newRecoveryCode():null;
    try {await database('checkpoint_users',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({username,display_name:displayName})})}
    catch(error){if(error.databaseStatus===409)return json({error:'That username is already taken. Sign in if it is yours.'},409);throw error}
    // The user row and its first session are two round trips. A half-finished signup would strand the
    // username behind "already taken", so undo it before telling the caller to try again.
    // The credential insert joins them: checkpoint_credentials cascades on delete, so the rollback
    // below cleans up a written credential row too.
    let cookie;
    try{
      if(secret)await database('checkpoint_credentials',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({username,secret,recovery_hash:recoveryHash(recovery),updated_at:new Date().toISOString()})});
      cookie=await issueSession(username);
    }
    catch(error){await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+username}),{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(cleanup=>console.error('Signup rollback failed, username may be stranded:',username,cleanup.databaseStatus??cleanup.name));throw error}
    const response=json({user:{username,display_name:displayName},...(secret?{recovery}:{enroll:true})},201);
    response.headers.set('Set-Cookie',cookie);return response;
  }catch(error){return fail(error)}
}
