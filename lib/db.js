import {config} from './config.js';
import {redact} from './http.js';
import {bad} from './errors.js';
// ONE budget for the whole call, never one per attempt: three naive 12 s tries would be 36 s and blow
// the function's time limit. Each attempt gets what is left, and a retry that cannot fit never starts.
const BUDGET_MS=12000,FLOOR_MS=500;
// Exported so a test can zero the waits.
export const RETRY_DELAYS=[150,600];
// The only retryable answers. 400/401/403/404/409 are answers, not faults: board.js reads 404 as
// "migration not applied" and signup reads 409 as "username taken", so both must arrive on try one.
const RETRYABLE=new Set([429,500,502,503,504]);
// AbortSignal.timeout rejects as TimeoutError; an explicit abort rejects as AbortError.
const transportFault=error=>error instanceof TypeError||error.name==='AbortError'||error.name==='TimeoutError';
const jitter=ms=>Math.round(ms*(1+Math.random()*0.5));
const backoff=(response,attempt)=>{const after=Number(response.headers.get('retry-after'));return response.status===429&&Number.isFinite(after)&&after>0?Math.min(after*1000,BUDGET_MS):jitter(RETRY_DELAYS[attempt])};
// False once the shared deadline cannot hold the wait plus a usable attempt, which ends the retries.
const pause=async(ms,deadline)=>{if(deadline-Date.now()-ms<FLOOR_MS)return false;if(ms>0)await new Promise(resolve=>setTimeout(resolve,ms));return true};
export async function database(path, options={}) {
  const c=config();
  // Only idempotent calls retry by default; a write opts in. checkpoint_sessions POST must not (it
  // would duplicate session rows) and checkpoint_users POST must not (it turns a signup 409 race
  // into the wrong message), so neither passes retry.
  const {retry=options.method===undefined||options.method==='GET',...init}=options;
  const deadline=Date.now()+BUDGET_MS,url=`${c.url}/rest/v1/${path}`;
  const headers={apikey:c.key,...(c.key.startsWith('eyJ')?{Authorization:`Bearer ${c.key}`} : {}),'Content-Type':'application/json',...init.headers};
  for(let attempt=0;;attempt++){
    const again=retry&&attempt<RETRY_DELAYS.length;
    let response;
    try{response=await fetch(url,{...init,headers,signal:AbortSignal.timeout(Math.max(deadline-Date.now(),FLOOR_MS))})}
    catch(error){if(again&&transportFault(error)&&await pause(jitter(RETRY_DELAYS[attempt]),deadline))continue;throw error}
    if(response.ok){const payload=await response.text();return payload.trim()?JSON.parse(payload):null}
    // Read the body before deciding: it drains the connection on a retry and carries the log detail.
    const detail=await response.text().catch(()=>'');
    if(again&&RETRYABLE.has(response.status)&&await pause(backoff(response,attempt),deadline))continue;
    // Keep database diagnostics and credentials off the public response: the path and the PostgREST
    // body (which carries the PGRST code and the violated constraint) are logged, never returned.
    console.error('Supabase request failed:',response.status,(options.method||'GET')+' /'+redact(path).slice(0,200),redact(detail).slice(0,500));
    throw bad('The update could not be saved or loaded. Please try again.',502,{databaseStatus:response.status});
  }
}
