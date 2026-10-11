export const TIME_ZONE = 'America/New_York';
export function easternDay(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const username = (process.env.CHECKPOINT_USERNAME || 'brother').trim().toLowerCase();
  if (!url || !key) throw Object.assign(new Error('Checkpoint is waiting for its Supabase connection.'), {status:503});
  if (!/^[a-z0-9_]{2,24}$/.test(username)) throw Object.assign(new Error('The posting username needs 2–24 letters, numbers, or underscores.'),{status:503});
  const origin = new URL(url);
  if(origin.protocol!=='https:') throw Object.assign(new Error('The database connection must use HTTPS.'),{status:503});
  return {url:origin.origin, key, username, displayName:process.env.CHECKPOINT_DISPLAY_NAME || 'My brother'};
}
export async function database(path, options={}) {
  const c=config();
  const response=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{apikey:c.key,...(c.key.startsWith('eyJ')?{Authorization:`Bearer ${c.key}`} : {}),'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(12000)});
  if(!response.ok){
    // Keep database diagnostics and credentials off the public response.
    console.error('Supabase request failed:',response.status);
    throw Object.assign(new Error('The update could not be saved or loaded. Please try again.'),{status:502,databaseStatus:response.status});
  }
  const payload = await response.text();
  return payload.trim() ? JSON.parse(payload) : null;
}
export function json(body,status=200) { return Response.json(body,{status,headers:{'Cache-Control':'no-store'}}); }
export function fail(error) {
  if (!error.status) console.error('Checkpoint server failure:', error.name, error.code, String(error.message || '').replace(/sb_secret_[A-Za-z0-9_-]+/g, '[redacted]'));
  return json({error:error.status?error.message:'The board is temporarily unavailable. Please try again.'},error.status||502);
}
export function validatePost(body,username){
  if(!body||typeof body!=='object')throw Object.assign(new Error('Please write an update.'),{status:400});
  if(typeof body.username!=='string'||body.username.trim().toLowerCase()!==username)throw Object.assign(new Error('That username is not the posting username for this board.'),{status:403});
  const message=typeof body.message==='string'?body.message.trim():'';
  if(!message||message.length>2000)throw Object.assign(new Error('Write an update between 1 and 2,000 characters.'),{status:400});
  if(typeof body.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id))throw Object.assign(new Error('Please refresh and try posting again.'),{status:400});
  return {id:body.id,username,message};
}
export function statsForDays(days,now=new Date(),timeZone=TIME_ZONE,breaks=[]){
  const sorted=[...new Set(days)].sort(),today=easternDay(now,timeZone);
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
export function sameOrigin(request) {
  const origin=request.headers.get('origin');
  if(!origin)return true;
  try{return new URL(origin).host===new URL(request.url).host}catch{return false}
}
export async function readBody(request) {
  try{return await request.json()}catch{throw Object.assign(new Error('Please send a valid update.'),{status:400})}
}
export function validateUsername(value) {
  const username=typeof value==='string'?value.trim().toLowerCase():'';
  if(!/^[a-z0-9_]{2,24}$/.test(username))throw Object.assign(new Error('Use 2–24 letters, numbers, or underscores for your username.'),{status:400});
  return username;
}
