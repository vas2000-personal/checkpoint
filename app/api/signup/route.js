import {database,json,fail,rateLimit,readBody,sameOrigin,validateUsername} from '../../../lib/server.js';
import {issueSession} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to create a user.'},403);
  try {
    const body=await readBody(request),username=validateUsername(body.username);
    const displayName=typeof body.displayName==='string'?body.displayName.trim()||username:username;
    if(displayName.length>60)return json({error:'Keep your display name under 60 characters.'},400);
    await rateLimit('signup:'+username,5,60);
    try {await database('checkpoint_users',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({username,display_name:displayName})})}
    catch(error){if(error.databaseStatus===409)return json({error:'That username is already taken. Sign in if it is yours.'},409);throw error}
    // The user row and its first session are two round trips. A half-finished signup would strand the
    // username behind "already taken", so undo it before telling the caller to try again.
    let cookie;
    try{cookie=await issueSession(username)}
    catch(error){await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+username}),{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(cleanup=>console.error('Signup rollback failed, username may be stranded:',username,cleanup.databaseStatus??cleanup.name));throw error}
    const response=json({user:{username,display_name:displayName}},201);
    response.headers.set('Set-Cookie',cookie);return response;
  }catch(error){return fail(error)}
}
