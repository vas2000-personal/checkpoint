import {database,json,fail,readBody,sameOrigin,validateUsername} from '../../../lib/server.js';
import {issueSession} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to create a user.'},403);
  try {
    const body=await readBody(request),username=validateUsername(body.username);
    const displayName=typeof body.displayName==='string'?body.displayName.trim()||username:username;
    if(displayName.length>60)return json({error:'Keep your display name under 60 characters.'},400);
    try {await database('checkpoint_users',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({username,display_name:displayName})})}
    catch(error){if(error.databaseStatus===409)return json({error:'That username is already taken. Sign in if it is yours.'},409);throw error}
    const cookie=await issueSession(username),response=json({user:{username,display_name:displayName}},201);
    response.headers.set('Set-Cookie',cookie);return response;
  }catch(error){return fail(error)}
}
