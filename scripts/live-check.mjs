// Read-only production smoke test: two GETs, no writes, no secrets, no dependencies.
const BASE=(process.env.CHECKPOINT_URL||'https://checkpoint.vas-anbu.dev').replace(/\/+$/,'');
const failures=[],check=(ok,message)=>{if(!ok)failures.push(message)};
// cp_ and sb_secret_ are matched key-shaped so ordinary prose or a class name cannot trip the scan.
const LEAKS=[[/awake_at/,'awake_at'],[/last_active_at/,'last_active_at'],[/still_up/,'still_up'],[/token_hash/,'token_hash'],[/cp_[A-Za-z0-9]{16,}/,'a cp_ API key'],[/sb_secret_/,'sb_secret_'],[/[\w-]+\.supabase\.co/,'a supabase.co URL']];
const scan=(text,where)=>{for(const [pattern,name] of LEAKS)if(pattern.test(text))check(false,where+' exposes '+name)};
async function get(path,accept) {
 const url=BASE+path;
 try{
   const response=await fetch(url,{headers:{accept},redirect:'follow',signal:AbortSignal.timeout(20000)}),body=await response.text();
   check(response.status===200,'GET '+path+' answered '+response.status+', expected 200');
   return {response,body};
 }catch(error){check(false,'GET '+path+' failed: '+error.message);return null}
}
const board=await get('/api/board','application/json');
if(board){
 const type=board.response.headers.get('content-type')||'';
 check(/application\/json/i.test(type),'/api/board content-type is '+(type||'missing')+', expected JSON');
 scan(board.body,'/api/board');
 let data=null;
 try{data=JSON.parse(board.body)}catch(error){check(false,'/api/board did not return JSON: '+error.message)}
 if(data&&typeof data==='object'&&!Array.isArray(data)){
   check(Array.isArray(data.posts),'/api/board posts is not an array');
   const stats=data.stats;
   if(!stats||typeof stats!=='object'||Array.isArray(stats))check(false,'/api/board stats is missing');
   else{
     for(const field of ['xp','streak','level'])check(Number.isFinite(stats[field]),'/api/board stats.'+field+' is not a number');
     check(Array.isArray(stats.days),'/api/board stats.days is not an array');
   }
   check(typeof data.today==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(data.today),'/api/board today is not a YYYY-MM-DD day');
   check(typeof data.timeZone==='string'&&data.timeZone.length>0,'/api/board timeZone is missing');
   check(typeof data.awake==='boolean','/api/board awake is not a boolean');
   check(typeof data.connected==='boolean','/api/board connected is not a boolean');
   if(!failures.length)console.log('board: '+data.posts.length+' posts, xp '+stats.xp+', streak '+stats.streak+', level '+stats.level+', '+stats.days.length+' days, today '+data.today+' ('+data.timeZone+'), awake '+data.awake+', connected '+data.connected);
 }else check(false,'/api/board did not return a JSON object');
}
const home=await get('/','text/html');
if(home){
 scan(home.body,'the public homepage');
 if(!failures.length)console.log('homepage: 200, '+home.body.length+' bytes of HTML, privacy contract clean');
}
if(failures.length){
 console.error('live-check FAILED against '+BASE);
 for(const failure of failures)console.error('  - '+failure);
 // exitCode, not exit(): killing the process while fetch keep-alive sockets are open aborts it on Windows.
 process.exitCode=1;
}else console.log('live-check passed against '+BASE);
