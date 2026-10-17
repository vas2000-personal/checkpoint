import {database,json,fail,readBody,sameOrigin,studyDay,notMigrated} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
import {connectedFor,noColumn} from '../../../lib/board.js';
import {validateTimeZone,validateSync,validateDisplayName,validateFamilyNote,validateShareAwake} from '../../../lib/study.js';
export const dynamic='force-dynamic';
// A missing table is a feature that is not installed, exactly as lib/board.js reads it: no Miss Log
// key table means no key, no awake table means nothing to report. Any other 404 is a fault and is
// rethrown, or a stale schema cache would quietly tell the owner his key had vanished.
const rowsOf=async path=>{try{return await database(path)||[]}catch(error){if(notMigrated(error))return [];throw error}};
const firstOf=async path=>(await rowsOf(path))[0]||null;
// Same reason as lib/board.js: a deploy lands before its migration, and an unknown column is a 400
// (42703), not a 404. Settings degrades to the pre-006 columns rather than refusing to show the owner
// his own time zone; the POST branches for the new fields still fail loudly, because a setting that
// silently did not save would be worse than an error.
const profileFor=async username=>{
 const path=extra=>'checkpoint_users?'+new URLSearchParams({select:'display_name,time_zone'+extra,username:'eq.'+username,limit:'1'});
 try{return await firstOf(path(',family_note,share_awake'))}
 catch(error){if(!noColumn(error))throw error;return await firstOf(path(''))}
};
// Bounded, not counted: PostgREST returns the row count only in a Content-Range header that
// database() does not surface, and an unbounded select over a session table is the wrong shape for a
// settings page. Nobody signs in from 200 devices; "200" on screen would still mean "far too many".
const DEVICE_LIMIT=200;
// SELF ONLY, and these three rules are the entire reason this route exists instead of a wider board:
//   - the username comes from currentUser(request) and NEVER from a query parameter or the body;
//   - it returns data only for that session's own user;
//   - nothing it returns may be added to getBoard or /api/board.
// missLog.lastSyncAt is a received_at, which is A TIMESTAMP THE PUBLIC CONTRACT BANS
// (tests/privacy.test.js). It is the owner's own data, shown only to the owner, and that is the only
// reason it may be returned here — it must never travel to the public payload on any route.
export async function GET(request){
 try{
  const user=await currentUser(request);if(!user)return json({error:'Please sign in.'},401);
  // Deliberately never new URL(request.url).searchParams.get('user'): this route has no such
  // parameter and must never grow one. A ?user= is ignored, so asking for somebody else's settings
  // answers with your own rather than theirs.
  const username=user.username,now=new Date();
  const [profile,devices,keys,breaks,connected,study,awake]=await Promise.all([
   profileFor(username),
   rowsOf('checkpoint_sessions?'+new URLSearchParams({select:'expires_at',username:'eq.'+username,expires_at:'gt.'+now.toISOString(),limit:String(DEVICE_LIMIT)})),
   rowsOf('checkpoint_api_keys?'+new URLSearchParams({select:'created_at,token_hash',username:'eq.'+username,order:'created_at.desc',limit:'10'})),
   rowsOf('checkpoint_breaks?'+new URLSearchParams({select:'start_day,until_day',username:'eq.'+username,order:'start_day.asc'})),
   // Settings is a page the owner opened, not the family's homepage, so a failure here is logged and
   // degrades to "not connected" rather than refusing to show him his own time zone.
   connectedFor(username,now).catch(error=>{console.error('Settings connected check failed:',error.databaseStatus??error.name);return false}),
   firstOf('checkpoint_study_days?'+new URLSearchParams({select:'received_at',username:'eq.'+username,order:'received_at.desc',limit:'1'})),
   firstOf('checkpoint_awake?'+new URLSearchParams({select:'received_at',username:'eq.'+username,order:'received_at.desc',limit:'1'}))
  ]);
  const timeZone=profile?.time_zone||user.time_zone,today=studyDay(now,timeZone);
  // Either kind of sync proves Miss Log reached us — the same two tables connectedFor reads — so the
  // later of the two is "last sync", and a study-only or awake-only day still answers.
  const synced=[study?.received_at,awake?.received_at].filter(Boolean).sort();
  return json({
   username,
   display_name:profile?.display_name??user.display_name??null,
   time_zone:timeZone,
   family_note:profile?.family_note??null,
   // Only an explicit false is off, so a database without supabase/migrations/006 reads as sharing,
   // which is what lib/board.js does with the same column.
   share_awake:profile?.share_awake!==false,
   activeBreak:breaks.filter(b=>b.start_day<=today&&b.until_day>=today).sort((a,b)=>b.until_day.localeCompare(a.until_day))[0]||null,
   devices:devices.length,
   // THE KEY ITSELF IS NEVER RETURNED, and cannot be: only its sha256 was ever stored. The first
   // eight hex characters go out as an id so the owner can point at one key among several and say
   // "revoke that one" — not invertible, not replayable, and scoped to his own rows either way.
   missLog:{hasKey:keys.length>0,keyCreatedAt:keys[0]?.created_at??null,keys:keys.filter(k=>/^[0-9a-f]{64}$/.test(k.token_hash||'')).map(k=>({id:k.token_hash.slice(0,8),createdAt:k.created_at})),connected,lastSyncAt:synced.at(-1)??null}
  });
 }catch(error){return fail(error)}
}
export async function POST(request){
 if(!sameOrigin(request))return json({error:'Open Checkpoint to change settings.'},403);
 try{
  const user=await currentUser(request);if(!user)return json({error:'Please sign in.'},401);
  const body=await readBody(request);
  if(body.time_zone!==undefined){const zone=validateTimeZone(body.time_zone);await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+user.username}),{method:'PATCH',body:JSON.stringify({time_zone:zone})});return json({ok:true,time_zone:zone})}
  if(body.display_name!==undefined){const display_name=validateDisplayName(body.display_name);await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+user.username}),{method:'PATCH',body:JSON.stringify({display_name})});return json({ok:true,display_name})}
  // null, and the empty string the validator folds into null, are how the owner CLEARS the note; the
  // board then falls back to its own line. So the branch keys on !==undefined, not on truthiness.
  if(body.family_note!==undefined){const family_note=validateFamilyNote(body.family_note);await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+user.username}),{method:'PATCH',body:JSON.stringify({family_note})});return json({ok:true,family_note})}
  if(body.share_awake!==undefined){const share_awake=validateShareAwake(body.share_awake);await database('checkpoint_users?'+new URLSearchParams({username:'eq.'+user.username}),{method:'PATCH',body:JSON.stringify({share_awake})});return json({ok:true,share_awake})}
  if(body.holiday===true){const data=validateSync(body,user.time_zone);await database('checkpoint_breaks?on_conflict=username,start_day',{method:'POST',retry:true,headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({username:user.username,start_day:data.start_day,until_day:data.until_day})});return json({ok:true})}
  if(body.holiday===false){
    const today=studyDay(new Date(),user.time_zone),yesterday=new Date(today+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
    await database('checkpoint_breaks?'+new URLSearchParams({username:'eq.'+user.username,start_day:'gte.'+today}),{method:'DELETE'});
    await database('checkpoint_breaks?'+new URLSearchParams({username:'eq.'+user.username,start_day:'lt.'+today,until_day:'gte.'+today}),{method:'PATCH',body:JSON.stringify({until_day:yesterday.toISOString().slice(0,10)})});
    return json({ok:true});
  }
  return json({error:'Choose a setting to change.'},400);
 }catch(error){return fail(error)}
}
