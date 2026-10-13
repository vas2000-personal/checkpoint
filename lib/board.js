import {config,database,statsForDays,studyDay} from './server.js';
import {weeklyStudy} from './study.js';
// Only whether they're up today leaves the server, never the times. PostgREST answers 404
// until supabase/awake_status.sql is applied; the board works without it.
export async function awakeFor(username,day){
    try{const rows=await database('checkpoint_awake?'+new URLSearchParams({select:'post_day',username:'eq.'+username,post_day:'eq.'+day,limit:'1'}));return !!rows?.length}
    catch(error){if(error.databaseStatus===404)return false;throw error}
}
// Connected: Miss Log reached Checkpoint (a study sync or an awake update) in the last 24 hours.
// Only the yes/no leaves the server.
export const CONNECTED_MS=24*3600e3;
export async function connectedFor(username,now=new Date()){
    const since=new Date(+now-CONNECTED_MS).toISOString(),q=new URLSearchParams({select:'received_at',username:'eq.'+username,received_at:'gte.'+since,limit:'1'});
    const [study,awake]=await Promise.all([database('checkpoint_study_days?'+q),database('checkpoint_awake?'+q).catch(error=>{if(error.databaseStatus===404)return [];throw error})]);
    return !!(study?.length||awake?.length);
}
export async function getBoard(before,selectedUsername,viewer) {
    const c=config();
    const users=await database('checkpoint_users?select=username,display_name,time_zone&order=created_at.asc');
    const selected=users.find(user=>user.username===selectedUsername)||users.find(user=>user.username===viewer?.username)||users.find(user=>user.username===c.username)||users[0]||{username:c.username,display_name:c.displayName};
    const q=new URLSearchParams({select:'id,username,message,created_at,post_day,study,source_updated_at,received_at,bucket_start',username:`eq.${selected.username}`,order:'created_at.desc,id.desc',limit:'51'});
    if(before){
      before=String(before);
      let decoded;try{decoded=JSON.parse(Buffer.from(before,'base64url').toString())}catch{throw Object.assign(new Error('Invalid page cursor.'),{status:400})}
      if(!decoded||typeof decoded!=='object'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|\+00:00)$/.test(decoded.time)||!/^[0-9a-f-]{36}$/i.test(decoded.id))throw Object.assign(new Error('Invalid page cursor.'),{status:400});
      q.set('or',`(created_at.lt.${decoded.time},and(created_at.eq.${decoded.time},id.lt.${decoded.id}))`);
    }
    const posts=await database('checkpoint_posts?'+q);
    const days=[];
    for(let offset=0;;offset+=1000){
      const rows=await database('checkpoint_days?'+new URLSearchParams({select:'post_day',username:`eq.${selected.username}`,order:'post_day.asc',limit:'1000',offset:String(offset)}));
      days.push(...rows.map(r=>r.post_day));if(rows.length<1000)break;
    }
    const page=posts.slice(0,50),now=new Date(),timeZone=selected.time_zone||'America/New_York',today=studyDay(now,timeZone);
    const start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-6);
    const [breaks,studyRows,todayRows,awake,connected]=await Promise.all([
      database('checkpoint_breaks?'+new URLSearchParams({select:'start_day,until_day',username:'eq.'+selected.username,order:'start_day.asc'})),
      database('checkpoint_study_days?'+new URLSearchParams({select:'post_day,study,source_updated_at',username:'eq.'+selected.username,post_day:'gte.'+start.toISOString().slice(0,10)})),
      database('checkpoint_study_days?'+new URLSearchParams({select:'message,post_day,study,source_updated_at,received_at',username:'eq.'+selected.username,post_day:'eq.'+today,limit:'1'})),
      awakeFor(selected.username,today),
      connectedFor(selected.username,now)
    ]);
    const activeBreak=breaks.filter(b=>b.start_day<=today&&b.until_day>=today).sort((a,b)=>b.until_day.localeCompare(a.until_day))[0]||null;
    return {posts:page,next:posts.length>50?Buffer.from(JSON.stringify({time:page.at(-1).created_at,id:page.at(-1).id})).toString('base64url'):null,stats:statsForDays(days,now,timeZone,breaks),timeZone,activeBreak,dailyStudy:todayRows[0]||null,awake,connected,weekly:weeklyStudy(studyRows,today),displayName:selected.display_name,selectedUsername:selected.username,users,currentUser:viewer,today};
}
