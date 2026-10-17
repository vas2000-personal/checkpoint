import {randomBytes,createHash} from 'node:crypto';
import {database,json,fail,sameOrigin,rateLimit,notMigrated} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// ISSUE AND REVOKE MISS LOG SYNC KEYS. Everything here is SELF-ONLY in the same way /api/settings is:
// the username comes from currentUser(request) and never from a query parameter or the body, so there
// is no shape of request that mints or revokes a key for somebody else. There is deliberately no GET
// — a key that could be read back is a key that leaks from any later bug that renders it, and
// /api/settings already reports the only facts a page needs: which keys exist and when they were made.
//
// ISSUING ADDS A KEY. It does not replace the one Miss Log is using: both work until the owner
// revokes the old one, so he can paste the new key in, watch a sync land, and only then disconnect
// the old machine. Rotating a credential by breaking the live connection first is how a sync quietly
// stays down for a day.
//
// THE PLAINTEXT EXISTS FOR ONE RESPONSE. It is generated here, hashed, and only the hash is sent to
// the database; the key itself is never stored, never logged (lib/http.js redact() strips `cp_`
// anyway) and cannot be recovered. Losing it means issuing another one, which is the same bargain the
// recovery code already makes.
//
// 48 random bytes, base64url: 64 characters of [A-Za-z0-9_-], which is exactly the token shape
// /api/checkpoint already accepts (`cp_[A-Za-z0-9_-]{64}`), so a key this route issues is a key that
// route recognizes without either of them learning a new format. 384 bits from the OS CSPRNG.
const KEY_BYTES=48;
const newKey=()=>'cp_'+randomBytes(KEY_BYTES).toString('base64url');
const hashOf=token=>createHash('sha256').update(token).digest('hex');
// The handle the settings page shows and sends back. The key was never stored, so the only stable id
// a row has is its hash; eight hex characters of a sha256 name one of at most five rows without being
// anything an attacker can invert or replay.
export const KEY_ID_LENGTH=8;
// A deploy can land before its migration: without 007 the function is a 404 from PostgREST, and the
// honest answer is "this is not installed yet", not a 500 that reads as a fault in the owner's account.
const missing=error=>notMigrated(error);
const NOT_INSTALLED={error:'Key rotation is not installed on this database yet. Apply migration 007 and try again.'};
// lib/db.js carries the database's SQLSTATE and deliberately not its message, so the migration gives
// each refusal its own code. CP001 is the only one the owner can act on, and the action is a sentence.
const TOO_MANY='CP001';

export async function POST(request){
 // A key is a credential, so the request must come from the board itself and not from a page a reader
 // was linked to — the same guard every other write on this origin uses.
 if(!sameOrigin(request))return json({error:'Open Settings to make a sync key.'},403);
 try{
  const user=await currentUser(request);
  if(!user)return json({error:'Please sign in.'},401);
  // Twelve an hour: more than the five-key cap can consume even if every issue is paired with a
  // revoke, and far less than a script could use for anything.
  await rateLimit('sync-key:'+user.username,12,3600,true,'Too many key changes. Please try again later.');
  const token=newKey(),tokenHash=hashOf(token);
  const created=await database('rpc/checkpoint_issue_key',{method:'POST',body:JSON.stringify({p_username:user.username,p_token_hash:tokenHash})});
  // The ONLY time this value is ever on the wire. The client shows it once and keeps it nowhere.
  return json({key:token,id:tokenHash.slice(0,KEY_ID_LENGTH),createdAt:created??new Date().toISOString()},201);
 }catch(error){
  if(missing(error))return json(NOT_INSTALLED,501);
  if(error?.databaseCode===TOO_MANY)return json({error:'You already have five sync keys. Revoke one before making another.'},409);
  return fail(error);
 }
}

// ?id=<first 8+ hex of the hash> revokes that one key; no id disconnects Miss Log entirely. The
// narrow one is the default path — the wide one is for a machine that is lost rather than replaced.
export async function DELETE(request){
 if(!sameOrigin(request))return json({error:'Open Settings to revoke a sync key.'},403);
 try{
  const user=await currentUser(request);
  if(!user)return json({error:'Please sign in.'},401);
  await rateLimit('sync-key:'+user.username,12,3600,true,'Too many key changes. Please try again later.');
  const id=(new URL(request.url).searchParams.get('id')||'').trim().toLowerCase();
  if(id&&!/^[0-9a-f]{8,64}$/.test(id))return json({error:'That is not a key id.'},400);
  const removed=id
   ? await database('rpc/checkpoint_revoke_key',{method:'POST',body:JSON.stringify({p_username:user.username,p_prefix:id})})
   : await database('rpc/checkpoint_revoke_keys',{method:'POST',body:JSON.stringify({p_username:user.username})});
  const count=Number(removed)||0;
  // A prefix that named nothing is the owner's stale tab, not a fault: say so rather than reporting
  // a success that revoked nothing.
  if(id&&!count)return json({error:'That key is already gone. Reload Settings to see the current list.'},404);
  return json({ok:true,removed:count});
 }catch(error){
  if(missing(error))return json(NOT_INSTALLED,501);
  return fail(error);
 }
}
