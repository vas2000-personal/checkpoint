export const TIME_ZONE = 'America/New_York';
export function easternDay(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
// Convert local calendar components, rather than subtracting elapsed hours across DST.
export function studyDay(date=new Date(),timeZone=TIME_ZONE){
 const day=easternDay(date,timeZone);
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(date));
 if(hour>=4)return day;
 const previous=new Date(day+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
 return previous.toISOString().slice(0,10);
}
