import {TIME_ZONE,studyDay} from './days.js';
export function statsForDays(days,now=new Date(),timeZone=TIME_ZONE,breaks=[]){
  const sorted=[...new Set(days)].sort(),today=studyDay(now,timeZone);
  // UTC noon is a date-only carrier for calendar arithmetic, not the day boundary.
  let streak=0,date=new Date(today+'T12:00:00Z');
  if(!sorted.includes(today))date.setUTCDate(date.getUTCDate()-1);
  const set=new Set(sorted);
  const earliest=sorted[0];
  while(earliest && date.toISOString().slice(0,10)>=earliest){
    const day=date.toISOString().slice(0,10);
    if(set.has(day))streak++;
    else if(!breaks.some(b=>b.start_day<=day&&b.until_day>=day))break;
    date.setUTCDate(date.getUTCDate()-1);
  }
  const xp=sorted.length*100;
  return {days:sorted,streak,xp,level:Math.floor(xp/300)+1,postedToday:set.has(today)};
}
