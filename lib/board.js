import {config} from './config.js';
import {database} from './db.js';
import {statsForDays} from './scoring.js';
import {TIME_ZONE,studyDay} from './days.js';
import {bad} from './errors.js';
import {weeklyStudy} from './study.js';
// Only whether they're up today leaves the server, never the times. PostgREST answers 404
// until supabase/awake_status.sql is applied; the board works without it.
export async function awakeFor(username,day){
    try{const rows=await database('checkpoint_awake?'+new URLSearchParams({select:'post_day',username:'eq.'+username,post_day:'eq.'+day,limit:'1'}));return !!rows?.length}
    catch(error){if(error.databaseStatus===404)return false;throw error}
}
const missing=error=>{if(error.databaseStatus===404)return [];throw error};
// Connected: Miss Log reached Checkpoint (a study sync or an awake update) in the last 24 hours.
// Only the yes/no leaves the server.
export const CONNECTED_MS=24*3600e3;
export async function connectedFor(username,now=new Date()){
    const since=new Date(+now-CONNECTED_MS).toISOString(),q=new URLSearchParams({select:'received_at',username:'eq.'+username,received_at:'gte.'+since,limit:'1'});
    const [study,awake]=await Promise.all([database('checkpoint_study_days?'+q).catch(missing),database('checkpoint_awake?'+q).catch(missing)]);
    return !!(study?.length||awake?.length);
}
// Both pills are decoration. The family's homepage must not go down because one of them could not
// be computed, so any failure degrades to false and is logged instead of thrown.
const optional=promise=>promise.catch(error=>{console.error('Optional board status failed:',error.databaseStatus??error.name,String(error.message||''));return false});
// The database walks the day list: one call in place of paging the whole posting history, with the
// break-protected streak done in SQL. A database without supabase/migrations/004 answers 404, and any
// other failure is logged and falls through to the identical JS walk below.
async function statsRpc(username,today){
    try{const result=await database('rpc/checkpoint_stats',{method:'POST',retry:true,body:JSON.stringify({p_username:username,p_today:today})});return result&&Array.isArray(result.days)?result:null}
    catch(error){if(error.databaseStatus!==404)console.error('Stats RPC unavailable:',error.databaseStatus??error.name,String(error.message||''));return null}
}
async function allDays(username){
    const days=[];
    for(let offset=0;;offset+=1000){
      const rows=await database('checkpoint_days?'+new URLSearchParams({select:'post_day',username:`eq.${username}`,order:'post_day.asc',limit:'1000',offset:String(offset)}));
      days.push(...rows.map(r=>r.post_day));if(rows.length<1000)break;
    }
    return days;
}
// The study jsonb is whitelisted on the way out as well as on the way in, so a direct database write
// or a loosened validator can never put a topic, a note or question text on the public board.
const COUNTS=['minutes','sessions','questions','correct','cards_reviewed','target_minutes','target_hit'];
// "Studying now" is decided here: received_at is a per-hour activity timestamp, so it stays on the
// server like every other time and only the boolean ships. A sync older than 15 minutes closes it.
export const STUDYING_MS=15*60*1000;
const publicPost=(row,now)=>{
    const {source_updated_at,received_at,...rest}=row;
    return row.study?{...rest,study:Object.fromEntries(COUNTS.map(k=>[k,row.study[k]])),studying:(row.message||'').startsWith('Studying now. ')&&!(+now-Date.parse(received_at)>STUDYING_MS)}:rest;
};
export async function getBoard(before,selectedUsername,viewer) {
    const c=config();
    // Nothing above the user list depends on the viewer, so a pending session lookup overlaps it.
    const [users,who]=await Promise.all([database('checkpoint_users?select=username,display_name,time_zone&order=created_at.asc'),viewer]);
    const selected=users.find(user=>user.username===selectedUsername)||users.find(user=>user.username===who?.username)||users.find(user=>user.username===c.username)||users[0]||{username:c.username,display_name:c.displayName};
    const q=new URLSearchParams({select:'id,username,message,created_at,post_day,study,received_at,bucket_start',username:`eq.${selected.username}`,order:'created_at.desc,id.desc',limit:'51'});
    if(before){
      before=String(before);
      let decoded;try{decoded=JSON.parse(Buffer.from(before,'base64url').toString())}catch{throw bad('Invalid page cursor.')}
      if(!decoded||typeof decoded!=='object'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|\+00:00)$/.test(decoded.time)||!/^[0-9a-f-]{36}$/i.test(decoded.id))throw bad('Invalid page cursor.');
      q.set('or',`(created_at.lt.${decoded.time},and(created_at.eq.${decoded.time},id.lt.${decoded.id}))`);
    }
    const now=new Date(),timeZone=selected.time_zone||TIME_ZONE,today=studyDay(now,timeZone);
    const start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-6);
    // One batch: every query below depends only on the selected user and today, never on each other.
    // Today's totals are the week window's row for today, so the week query answers both.
    const [posts,counted,breaks,studyRows,awake,connected]=await Promise.all([
      database('checkpoint_posts?'+q),
      statsRpc(selected.username,today),
      database('checkpoint_breaks?'+new URLSearchParams({select:'start_day,until_day',username:'eq.'+selected.username,order:'start_day.asc'})),
      database('checkpoint_study_days?'+new URLSearchParams({select:'message,post_day,study,source_updated_at,received_at',username:'eq.'+selected.username,post_day:'gte.'+start.toISOString().slice(0,10)})),
      optional(awakeFor(selected.username,today)),
      optional(connectedFor(selected.username,now))
    ]);
    const stats=counted?{days:counted.days,streak:counted.streak,xp:counted.days.length*100,level:Math.floor(counted.days.length*100/300)+1,postedToday:!!counted.posted_today}:statsForDays(await allDays(selected.username),now,timeZone,breaks);
    const page=posts.slice(0,50),todayRow=studyRows.find(row=>row.post_day===today)||null;
    const activeBreak=breaks.filter(b=>b.start_day<=today&&b.until_day>=today).sort((a,b)=>b.until_day.localeCompare(a.until_day))[0]||null;
    return {posts:page.map(post=>publicPost(post,now)),next:posts.length>50?Buffer.from(JSON.stringify({time:page.at(-1).created_at,id:page.at(-1).id})).toString('base64url'):null,stats,timeZone,activeBreak,dailyStudy:todayRow?publicPost(todayRow,now):null,awake,connected,weekly:weeklyStudy(studyRows,today),displayName:selected.display_name,selectedUsername:selected.username,users,currentUser:who||null,today};
}
