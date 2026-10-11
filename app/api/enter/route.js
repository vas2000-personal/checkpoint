import {database,json,fail,readBody,sameOrigin,validateUsername} from '../../../lib/server.js';
import {issueSession} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to sign in.'},403);
  try {
    const body=await readBody(request),username=validateUsername(body.username);
    const users=await database('checkpoint_users?'+new URLSearchParams({select:'username,display_name',username:`eq.${username}`,limit:'1'}));
    if(!users.length)return json({error:'That username does not exist yet. Choose New user to create it.'},404);
    const cookie=await issueSession(username),response=json({user:users[0]});
    response.headers.set('Set-Cookie',cookie);return response;
  }catch(error){return fail(error)}
}
