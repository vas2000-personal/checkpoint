import {getBoard} from '../../../lib/board.js';
import {json,fail} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
export const dynamic='force-dynamic';
export async function GET(request) {
  // getBoard awaits the viewer inside its first Promise.all so the session lookup overlaps the user
  // list. It can also throw before getting there (a missing Supabase config is a 503), so the promise
  // carries its own catch and cannot become an unhandled rejection that kills the function.
  const viewer=currentUser(request);viewer.catch(()=>{});
  try {const params=new URL(request.url).searchParams;return json(await getBoard(params.get('before'),params.get('user'),viewer))}catch(error){return fail(error)}
}
