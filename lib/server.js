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
// Service keys reach the log in three shapes: sb_secret_, legacy eyJ JWTs, and Miss Log's cp_ bearers.
export function redact(value){const key=process.env.SUPABASE_SECRET_KEY;let text=String(value??'');if(key)text=text.split(key).join('[redacted]');return text.replace(/(sb_secret_|cp_|eyJ)[A-Za-z0-9_.-]+/g,'[redacted]')}
export async function database(path, options={}) {
  const c=config();
  const response=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{apikey:c.key,...(c.key.startsWith('eyJ')?{Authorization:`Bearer ${c.key}`} : {}),'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(12000)});
  if(!response.ok){
    // Keep database diagnostics and credentials off the public response: the path and the PostgREST
    // body (which carries the PGRST code and the violated constraint) are logged, never returned.
    const detail=await response.text().catch(()=>'');
    console.error('Supabase request failed:',response.status,(options.method||'GET')+' /'+redact(path).slice(0,200),redact(detail).slice(0,500));
    throw Object.assign(new Error('The update could not be saved or loaded. Please try again.'),{status:502,databaseStatus:response.status});
  }
  const payload = await response.text();
  return payload.trim() ? JSON.parse(payload) : null;
}
// Vercel functions share no memory, so the counter lives in the database: one upsert per attempt.
// A database without supabase/migrations/004 answers 404 and simply does not limit, like the awake table.
export async function rateLimit(key,limit,windowSeconds){
  let result;
  try{result=await database('rpc/checkpoint_attempt',{method:'POST',body:JSON.stringify({p_key:key,p_limit:limit,p_window_seconds:windowSeconds})})}
  catch(error){if(error.databaseStatus!==404)console.error('Rate limit check unavailable:',error.databaseStatus??error.name,redact(error.message));return}
  if(result&&result.allowed===false)throw Object.assign(new Error('Too many attempts. Please wait a moment and try again.'),{status:429,retryAfter:Number(result.retry_after)||60});
}
export function json(body,status=200) { return Response.json(body,{status,headers:{'Cache-Control':'no-store'}}); }
export function fail(error) {
  if (!error.status) console.error('Checkpoint server failure:', error.name, error.code, redact(error.message), redact(error.stack));
  const response=json({error:error.status?error.message:'The board is temporarily unavailable. Please try again.'},error.status||502);
  if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter));
  return response;
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
export function sameOrigin(request) {
  const origin=request.headers.get('origin');
  if(!origin)return true;
  try{return new URL(origin).host===new URL(request.url).host}catch{return false}
}
export async function readBody(request) {
  // JSON.parse('null') succeeds, so a parsed body is not yet a usable one.
  try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw 0;return body}catch{throw Object.assign(new Error('Please send a valid update.'),{status:400})}
}
export function validateUsername(value) {
  const username=typeof value==='string'?value.trim().toLowerCase():'';
  if(!/^[a-z0-9_]{2,24}$/.test(username))throw Object.assign(new Error('Use 2–24 letters, numbers, or underscores for your username.'),{status:400});
  return username;
}
