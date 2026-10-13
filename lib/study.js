import {easternDay,studyDay,TIME_ZONE} from './server.js';
const bad=message=>Object.assign(new Error(message),{status:400});
export function validDay(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value;
}
export function validateTimeZone(value) {
 if(typeof value!=='string'||value.length>80)throw bad('Choose a valid time zone.');
 try{return new Intl.DateTimeFormat('en-US',{timeZone:value}).resolvedOptions().timeZone}catch{throw bad('Choose a valid time zone.')}
}
export function validateSync(body,timeZone=TIME_ZONE,now=new Date()) {
 if(!body||typeof body!=='object'||Array.isArray(body))throw bad('Send a JSON object.');
 const today=studyDay(now,timeZone);
 if(body.holiday===true){
   if(Object.keys(body).some(k=>!['holiday','until'].includes(k)))throw bad('A break request accepts only holiday and until.');
   const max=new Date(today+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+365);
   if(!validDay(body.until)||body.until<today||body.until>max.toISOString().slice(0,10))throw bad('Choose a break ending today or within the next year.');
   return {holiday:true,start_day:today,until_day:body.until};
 }
 if(body.awake_at!==undefined)return validateAwake(body,timeZone,now);
 if(Object.keys(body).some(k=>!['date','text','study','updated_at'].includes(k)))throw bad('Only date, text, study and updated_at are accepted.');
 if(typeof body.updated_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(body.updated_at)||!validDay(body.updated_at.slice(0,10))||!Number.isFinite(Date.parse(body.updated_at))||Date.parse(body.updated_at)>+now+300000)throw bad('Send a valid updated_at timestamp with an offset, no more than five minutes ahead.');
 const instant=new Date(body.updated_at),localCalendar=easternDay(instant,timeZone),localStudyDay=studyDay(instant,timeZone);
 // Existing clients may send a calendar date; normalize it to the 4 a.m. study day.
 const day=body.date===undefined||body.date===localCalendar?localStudyDay:body.date;
 if(!validDay(day)||day>today||day<'2000-01-01')throw bad('Send a valid study date in your profile time zone, today or earlier. Days reset at 4 a.m.');
 const text=typeof body.text==='string'?body.text.trim():'';
 if(!text||text.length>2000)throw bad('Text must be between 1 and 2,000 characters.');
 const study=body.study,fields=['minutes','sessions','questions','correct','cards_reviewed','target_minutes'];
 if(!study||typeof study!=='object'||Array.isArray(study)||Object.keys(study).some(k=>![...fields,'target_hit'].includes(k)))throw bad('Study accepts counts only, without questions, topics or notes.');
 for(const field of fields)if(!Number.isSafeInteger(study[field])||study[field]<0||study[field]>1000000)throw bad(field+' must be a whole number between 0 and 1,000,000.');
 if(study.minutes>1440||study.target_minutes>1440||study.correct>study.questions||typeof study.target_hit!=='boolean'||study.target_hit!==(study.minutes>=study.target_minutes))throw bad('Study totals or target_hit are inconsistent.');
 return {day,text,study:Object.fromEntries([...fields,'target_hit'].map(k=>[k,study[k]])),updated_at:new Date(body.updated_at).toISOString()};
}
const STAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// Same timestamp rules as updated_at, plus a ~36 h floor so stale replays cannot open a new day.
function stamp(value,name,now){if(typeof value!=='string'||!STAMP.test(value)||!validDay(value.slice(0,10))||!Number.isFinite(Date.parse(value))||Date.parse(value)>+now+300000||Date.parse(value)<+now-36*3600000)throw bad('Send a valid '+name+' timestamp with an offset, no more than five minutes ahead or 36 hours old.');return new Date(value)}
export function validateAwake(body,timeZone=TIME_ZONE,now=new Date()) {
 if(Object.keys(body).some(k=>!['awake_at','last_active_at','after_idle_min'].includes(k)))throw bad('An awake update accepts only awake_at, last_active_at and after_idle_min.');
 const awake=stamp(body.awake_at,'awake_at',now),day=studyDay(awake,timeZone),last=body.last_active_at===undefined?null:stamp(body.last_active_at,'last_active_at',now);
 if(last&&(last<awake||studyDay(last,timeZone)!==day))throw bad('last_active_at must be on the same study day as awake_at, and not before it.');
 const idle=body.after_idle_min;
 if(idle!==undefined&&(!Number.isSafeInteger(idle)||idle<0||idle>527040))throw bad('after_idle_min must be a whole number of minutes.');
 // Under three idle hours means the night never really ended.
 return {awake:true,day,awake_at:awake.toISOString(),last_active_at:last?last.toISOString():null,still_up:idle!==undefined&&idle<180};
}
export function weeklyStudy(rows,today) {
 const week=Array.from({length:7},(_,i)=>{const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-6+i);return {date:day.toISOString().slice(0,10),minutes:0,questions:0,correct:0}});
 const latest=new Map();
 for(const row of rows){const previous=latest.get(row.post_day);if(!previous||String(row.source_updated_at||'')>=String(previous.source_updated_at||''))latest.set(row.post_day,row)}
 for(const row of latest.values()){const day=week.find(d=>d.date===row.post_day);if(day&&row.study)for(const k of ['minutes','questions','correct'])day[k]=row.study[k]}
 const totals=week.reduce((a,d)=>({minutes:a.minutes+d.minutes,questions:a.questions+d.questions,correct:a.correct+d.correct}),{minutes:0,questions:0,correct:0});
 return {days:week,...totals,accuracy:totals.questions?Math.round(totals.correct/totals.questions*100):null};
}
