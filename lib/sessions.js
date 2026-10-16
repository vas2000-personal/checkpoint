import {randomBytes,createHash} from 'node:crypto';
import {database} from './server.js';
const COOKIE='checkpoint_session';
const SESSION_SECONDS=180*24*60*60;
const hash=token=>createHash('sha256').update(token).digest('hex');
export async function currentUser(request) {
  const token=(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||!/^[0-9a-f]{64}$/.test(token))return null;
  const sessions=await database('checkpoint_sessions?'+new URLSearchParams({select:'username',token_hash:'eq.'+hash(token),expires_at:'gt.'+new Date().toISOString(),limit:'1'}));
  if(!sessions.length)return null;
  const users=await database('checkpoint_users?'+new URLSearchParams({select:'username,display_name,time_zone',username:'eq.'+sessions[0].username,limit:'1'}));
  return users[0]||null;
}
export async function issueSession(username) {
  const token=randomBytes(32).toString('hex');
  await database('checkpoint_sessions',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({token_hash:hash(token),username,expires_at:new Date(Date.now()+SESSION_SECONDS*1000).toISOString()})});
  // Opportunistic sweep over checkpoint_sessions_expiry_idx: nothing else ever deletes an expired row.
  // Deliberately not awaited, so sign-in never waits on it, and never left as an unhandled rejection.
  database('checkpoint_sessions?'+new URLSearchParams({username:'eq.'+username,expires_at:'lt.'+new Date().toISOString()}),{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
export async function endSession(request) {
  const token=(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(token&&/^[0-9a-f]{64}$/.test(token))await database('checkpoint_sessions?'+new URLSearchParams({token_hash:'eq.'+hash(token)}),{method:'DELETE'});
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
