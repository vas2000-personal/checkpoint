import {database,json,fail,validatePost,readBody,sameOrigin,easternDay} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to post an update.'},403);
  try {
    const user=await currentUser(request);
    if(!user)return json({error:'Please sign in to save a checkpoint.'},401);
    const body=await readBody(request);
    const post={...validatePost({...body,username:user.username},user.username),post_day:easternDay(new Date(),user.time_zone)};
    await database('checkpoint_posts?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(post)});
    return json({ok:true},201);
  }catch(error){return fail(error)}
}
