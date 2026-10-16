import {bad} from './errors.js';
// Service keys reach the log in three shapes: sb_secret_, legacy eyJ JWTs, and Miss Log's cp_ bearers.
export function redact(value){const key=process.env.SUPABASE_SECRET_KEY;let text=String(value??'');if(key)text=text.split(key).join('[redacted]');return text.replace(/(sb_secret_|cp_|eyJ)[A-Za-z0-9_.-]+/g,'[redacted]')}
export function json(body,status=200) { return Response.json(body,{status,headers:{'Cache-Control':'no-store'}}); }
export function fail(error) {
  if (!error.status) console.error('Checkpoint server failure:', error.name, error.code, redact(error.message), redact(error.stack));
  const response=json({error:error.status?error.message:'The board is temporarily unavailable. Please try again.'},error.status||502);
  if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter));
  return response;
}
export function sameOrigin(request) {
  const origin=request.headers.get('origin');
  if(!origin)return true;
  try{return new URL(origin).host===new URL(request.url).host}catch{return false}
}
export async function readBody(request) {
  // JSON.parse('null') succeeds, so a parsed body is not yet a usable one.
  try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw 0;return body}catch{throw bad('Please send a valid update.',400)}
}
