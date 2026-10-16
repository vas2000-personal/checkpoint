import {database,json,fail,validatePost,readBody,sameOrigin,studyDay} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
export async function POST(request) {
  if(!sameOrigin(request))return json({error:'Open the board to post an update.'},403);
  try {
    const user=await currentUser(request);
    if(!user)return json({error:'Please sign in to save a checkpoint.'},401);
    const body=await readBody(request);
    const post={...validatePost({...body,username:user.username},user.username),post_day:studyDay(new Date(),user.time_zone)};
    await database('checkpoint_posts?on_conflict=id',{method:'POST',retry:true,headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(post)});
    return json({ok:true},201);
  }catch(error){return fail(error)}
}
