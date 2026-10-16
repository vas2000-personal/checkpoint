import {createHash} from 'node:crypto';
import {database,json,fail,rateLimit} from '../../../lib/server.js';
import {validateSync} from '../../../lib/study.js';
export const runtime='nodejs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'};
const response=(body,status=200)=>{const r=json(body,status);for(const [k,v] of Object.entries(cors))r.headers.set(k,v);return r};
export function OPTIONS(){return new Response(null,{status:204,headers:cors})}
export async function POST(request) {
 try{
   const token=/^Bearer (cp_[A-Za-z0-9_-]{64})$/.exec(request.headers.get('authorization')||'')?.[1];
   if(!token)return response({error:'A valid bearer key is required.'},401);
   // Cheap checks first: an oversized or flooding caller must not cost a database round trip.
   if(Number(request.headers.get('content-length'))>16384)return response({error:'Payload is too large.'},413);
   const tokenHash=createHash('sha256').update(token).digest('hex');
   await rateLimit('sync:'+tokenHash,60,60);
   const keys=await database('checkpoint_api_keys?'+new URLSearchParams({select:'username',token_hash:'eq.'+tokenHash,limit:'1'}));
   if(!keys.length)return response({error:'A valid bearer key is required.'},401);
   const username=keys[0].username;
   const users=await database('checkpoint_users?'+new URLSearchParams({select:'time_zone',username:'eq.'+username,limit:'1'}));
   if(!users.length)return response({error:'A valid bearer key is required.'},401);
   // Limit streamed bodies too, even when Content-Length is missing.
   const reader=request.body?.getReader();let chunks=[],size=0;
   if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return response({error:'Payload is too large.'},413)}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return response({error:'Send valid JSON.'},400)}
   const data=validateSync(body,users[0].time_zone);
   if(data.holiday){
     await database('checkpoint_breaks?on_conflict=username,start_day',{method:'POST',retry:true,headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({username,start_day:data.start_day,until_day:data.until_day})});
     return response({ok:true,holiday:true,until:data.until_day});
   }
   if(data.awake){
     // Earliest awake_at and latest last_active_at win inside the database, so retries are harmless.
     const saved=await database('rpc/checkpoint_awake',{method:'POST',retry:true,body:JSON.stringify({p_username:username,p_day:data.day,p_awake_at:data.awake_at,p_still_up:data.still_up,p_last_active_at:data.last_active_at})});
     return response({ok:true,date:data.day,awake_at:saved?.awake_at??data.awake_at,last_active_at:saved?.last_active_at??data.last_active_at});
   }
   const result=await database('rpc/checkpoint_sync',{method:'POST',retry:true,body:JSON.stringify({p_username:username,p_day:data.day,p_text:data.text,p_study:data.study,p_updated_at:data.updated_at})});
   return response(result);
 }catch(error){const r=fail(error);for(const [k,v] of Object.entries(cors))r.headers.set(k,v);return r}
}
