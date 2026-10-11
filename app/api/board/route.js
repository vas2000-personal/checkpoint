import {getBoard} from '../../../lib/board.js';
import {json,fail} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
export const dynamic='force-dynamic';
export async function GET(request) {
  try {const params=new URL(request.url).searchParams;return json(await getBoard(params.get('before'),params.get('user'),await currentUser(request)))}catch(error){return fail(error)}
}
