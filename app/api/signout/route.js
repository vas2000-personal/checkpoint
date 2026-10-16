import {database,json,fail,sameOrigin} from '../../../lib/server.js';
import {endSession,currentUser} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to sign out.'},403);
  try {
    // {all:true} is "sign out everywhere". The username comes from the SESSION, never the body, so
    // the switch can only ever revoke the caller's own devices. The body is optional and stays
    // optional: a plain sign-out posts nothing at all, and a missing or unparsable one must not
    // become a 400 on the way out of the door, so this never goes through readBody().
    const body=await request.json().catch(()=>null),all=body?.all===true;
    // Read the username BEFORE the delete: the lookup needs this device's own session row, and the
    // DELETE below is the row that would answer it. A session that has already expired finds no user
    // and simply clears the cookie, which is the same answer it gave before.
    const user=all?await currentUser(request):null;
    if(user)await database('checkpoint_sessions?'+new URLSearchParams({username:'eq.'+user.username}),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    // Always the cookie as well, even when the sweep above already removed the row behind it: the
    // browser is what has to stop sending a token that no longer resolves.
    const cookie=await endSession(request),response=json({ok:true,all});response.headers.set('Set-Cookie',cookie);return response
  }catch(error){return fail(error)}
}
