const UNREACHABLE='The board could not be reached. Please try again.';
const failure=(message,status,body)=>Object.assign(Error(message),{status,body});
export async function send(path,body,timeout=15000) {
 const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(timeout)});
 let result;try{result=await response.json()}catch{throw failure(UNREACHABLE,response.status,null)}
 if(!response.ok)throw failure(result.error||'Please try again.',response.status,result);
 return result;
}
// A thrown error carries status only once the server answered, so its absence means the request never
// arrived: a GET is then safe to repeat once, a POST never is. A timeout is not repeated either.
export async function api(path,body) {
 try{return await send(path,body)}
 catch(error){
  if(error.status!==undefined)throw error;
  if(body||error.name!=='TypeError')throw failure(UNREACHABLE,0,null);
  try{return await send(path,body)}catch(again){throw again.status!==undefined?again:failure(UNREACHABLE,0,null)}
 }
}
// A background refresh returns page 1 only, so fold it over whatever pages the reader already has open,
// letting the fresh copy of a post win so updated study totals land.
export function mergePosts(kept,incoming,more) {
 return more?[...kept,...incoming.filter(post=>!kept.some(old=>old.id===post.id))]:[...incoming,...kept.filter(old=>!incoming.some(post=>post.id===old.id))];
}
// The compactFeed preference, as a pure filter so it can be tested without a DOM. An hourly summary
// card is a post Miss Log opened a clock hour for, which is exactly `bucket_start != null`; a written
// checkpoint has none, and the day's totals live in the status bar rather than in this list.
export const feedPosts=(posts,compact)=>compact?(posts||[]).filter(post=>post.bucket_start==null):posts||[];
