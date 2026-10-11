import {json,fail,sameOrigin} from '../../../lib/server.js';
import {endSession} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to sign out.'},403);
  try {const cookie=await endSession(request),response=json({ok:true});response.headers.set('Set-Cookie',cookie);return response}catch(error){return fail(error)}
}
