import {database,json,fail,readBody,sameOrigin,studyDay} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
import {validateTimeZone,validateSync} from '../../../lib/study.js';
export async function POST(request){
 if(!sameOrigin(request))return json({error:'Open Checkpoint to change settings.'},403);
 try{
  const user=await currentUser(request);if(!user)return json({error:'Please sign in.'},401);
  const body=await readBody(request);
  if(body.time_zone!==undefined){const zone=validateTimeZone(body.time_zone);await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+user.username}),{method:'PATCH',body:JSON.stringify({time_zone:zone})});return json({ok:true,time_zone:zone})}
  if(body.holiday===true){const data=validateSync(body,user.time_zone);await database('checkpoint_breaks?on_conflict=username,start_day',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({username:user.username,start_day:data.start_day,until_day:data.until_day})});return json({ok:true})}
  if(body.holiday===false){
    const today=studyDay(new Date(),user.time_zone),yesterday=new Date(today+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
    await database('checkpoint_breaks?'+new URLSearchParams({username:'eq.'+user.username,start_day:'gte.'+today}),{method:'DELETE'});
    await database('checkpoint_breaks?'+new URLSearchParams({username:'eq.'+user.username,start_day:'lt.'+today,until_day:'gte.'+today}),{method:'PATCH',body:JSON.stringify({until_day:yesterday.toISOString().slice(0,10)})});
    return json({ok:true});
  }
  return json({error:'Choose a time zone or break setting.'},400);
 }catch(error){return fail(error)}
}
