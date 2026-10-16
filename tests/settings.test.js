import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {studyDay} from '../lib/server.js';
import {getBoard} from '../lib/board.js';
import {validateDisplayName,validateFamilyNote,validateShareAwake,FAMILY_NOTE_MAX} from '../lib/study.js';
import {GET as readSettings,POST as writeSettings} from '../app/api/settings/route.js';
import {GET as exportOwn} from '../app/api/export/route.js';
import {POST as signout} from '../app/api/signout/route.js';
const zone='America/New_York',today=studyDay(new Date(),zone);
const SESSION='a'.repeat(64),SESSION_HASH=createHash('sha256').update(SESSION).digest('hex');
const OTHER='b'.repeat(64),OTHER_HASH=createHash('sha256').update(OTHER).digest('hex');
const THIRD='c'.repeat(64),THIRD_HASH=createHash('sha256').update(THIRD).digest('hex');
const MUM='d'.repeat(64),MUM_HASH=createHash('sha256').update(MUM).digest('hex');
const env=()=>{process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key'};
// A PostgREST stub that actually FILTERS. The self-only tests below are worthless against a stub that
// answers the same row whatever username was asked for: the whole question is which username the
// route put in the query, so the stub has to be able to answer with somebody else's row.
const OPS={eq:(a,b)=>String(a)===b,neq:(a,b)=>String(a)!==b,gt:(a,b)=>String(a)>b,gte:(a,b)=>String(a)>=b,lt:(a,b)=>String(a)<b,lte:(a,b)=>String(a)<=b};
const matches=(row,params)=>[...params].every(([key,value])=>{
 if(['select','order','limit','offset','or','on_conflict'].includes(key))return true;
 const dot=String(value).indexOf('.'),op=String(value).slice(0,dot),want=String(value).slice(dot+1);
 return OPS[op]?OPS[op](row[key],want):true;
});
const project=(row,select)=>!select||select==='*'?{...row}:Object.fromEntries(select.split(',').filter(column=>column in row).map(column=>[column,row[column]]));
const read=(rows,u)=>{
 const picked=rows.filter(row=>matches(row,u.searchParams)),offset=Number(u.searchParams.get('offset')||0);
 const limit=Number(u.searchParams.get('limit')||1000);
 return Response.json(picked.slice(offset,offset+limit).map(row=>project(row,u.searchParams.get('select'))));
};
const install=tables=>{
 env();const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),name=u.pathname.replace('/rest/v1/',''),table=name.split('?')[0],method=options.method||'GET';
  calls.push({table,method,query:u.searchParams,body:options.body?JSON.parse(options.body):null});
  if(table==='rpc/checkpoint_stats')return Response.json({code:'PGRST202',message:'no function'},{status:404});
  const rows=tables[table];
  if(!rows)return Response.json({code:'PGRST205',message:'Could not find the table in the schema cache'},{status:404});
  if(method==='DELETE'){for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],u.searchParams))rows.splice(i,1);return new Response(null,{status:204})}
  if(method==='PATCH'){for(const row of rows)if(matches(row,u.searchParams))Object.assign(row,JSON.parse(options.body||'{}'));return new Response(null,{status:204})}
  if(method==='POST'){rows.push(JSON.parse(options.body||'{}'));return new Response(null,{status:201})}
  return read(rows,u);
 };
 return {calls,restore(){globalThis.fetch=previous}};
};
const world=(overrides={})=>({
 checkpoint_users:[
  {username:'gir',display_name:'Varun',time_zone:zone,family_note:'A window into my day.',share_awake:true,...overrides},
  {username:'mum',display_name:'Mum',time_zone:zone,family_note:null,share_awake:true}
 ],
 checkpoint_sessions:[
  {token_hash:SESSION_HASH,username:'gir',expires_at:'2099-01-01T00:00:00Z'},
  {token_hash:OTHER_HASH,username:'gir',expires_at:'2099-01-02T00:00:00Z'},
  {token_hash:THIRD_HASH,username:'gir',expires_at:'2099-01-03T00:00:00Z'},
  {token_hash:MUM_HASH,username:'mum',expires_at:'2099-01-04T00:00:00Z'}
 ],
 checkpoint_api_keys:[{username:'gir',created_at:'2026-01-02T03:04:05+00:00'}],
 checkpoint_breaks:[{username:'gir',start_day:today,until_day:today},{username:'mum',start_day:'2020-01-01',until_day:'2020-01-02'}],
 checkpoint_study_days:[{username:'gir',post_day:today,message:'Steady day.',study:{minutes:90,sessions:2,questions:40,correct:36,cards_reviewed:12,target_minutes:60,target_hit:true},source_updated_at:'2026-10-16T01:00:00+00:00',received_at:new Date().toISOString()}],
 checkpoint_awake:[{username:'gir',post_day:today,awake_at:'2026-10-16T07:12:00+00:00',last_active_at:'2026-10-16T23:40:00+00:00',still_up:true,received_at:new Date().toISOString()}],
 checkpoint_posts:[{id:'11111111-1111-4111-8111-111111111111',username:'gir',message:'He said "hello", then left\r\nand came back.',created_at:'2026-10-14T18:00:00+00:00',post_day:today,study:null,source_updated_at:null,received_at:null,bucket_start:null}],
 checkpoint_days:[{username:'gir',post_day:today}]
});
const getRequest=(path,cookie=SESSION)=>new Request('https://checkpoint.test'+path,{headers:cookie?{Cookie:'checkpoint_session='+cookie}:{}});
const postRequest=(path,body,cookie=SESSION)=>new Request('https://checkpoint.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:'checkpoint_session='+cookie}:{})},body:JSON.stringify(body)});

test('GET /api/settings answers the session’s own user and ignores a ?user= parameter',async()=>{
 const {calls,restore}=install(world());
 try{
  // @mum exists, has her own row, her own session and her own break, so a route that honored the
  // query parameter would be able to answer with her data. It must answer with @gir's regardless.
  const response=await readSettings(getRequest('/api/settings?user=mum&username=mum'));
  assert.equal(response.status,200);
  const own=await response.json();
  assert.equal(own.username,'gir');
  assert.equal(own.display_name,'Varun');
  assert.equal(own.family_note,'A window into my day.');
  assert.deepEqual(own.activeBreak,{start_day:today,until_day:today},'@gir’s break, not @mum’s');
  for(const call of calls)if(call.query.has('username'))assert.notEqual(call.query.get('username'),'eq.mum','no query may be built from the parameter');
  assert.equal((await readSettings(getRequest('/api/settings',null))).status,401,'no session, no settings');
  assert.equal((await readSettings(getRequest('/api/settings','f'.repeat(64)))).status,401,'an unknown token is not a session');
 }finally{restore()}
});
test('GET /api/settings returns the owner-only shape, including the received_at the board may not carry',async()=>{
 const {restore}=install(world());
 try{
  const own=await (await readSettings(getRequest('/api/settings'))).json();
  assert.deepEqual(Object.keys(own).sort(),['activeBreak','devices','display_name','family_note','missLog','share_awake','time_zone','username']);
  assert.deepEqual(Object.keys(own.missLog).sort(),['connected','hasKey','keyCreatedAt','lastSyncAt']);
  assert.equal(own.time_zone,zone);
  assert.equal(own.share_awake,true);
  assert.equal(own.devices,3,'three of the four session rows are @gir’s');
  assert.equal(own.missLog.hasKey,true);
  assert.equal(own.missLog.keyCreatedAt,'2026-01-02T03:04:05+00:00');
  assert.equal(own.missLog.connected,true);
  assert.ok(own.missLog.lastSyncAt,'the owner sees his own last sync time');
  // The key never leaves the database in any shape, not even as the hash that is stored.
  const serialized=JSON.stringify(own);
  assert.ok(!serialized.includes('token_hash')&&!serialized.includes('cp_'),'no key material in the settings payload');
 }finally{restore()}
});
test('GET /api/settings degrades where a migration is missing instead of refusing the page',async()=>{
 const partial=world();delete partial.checkpoint_api_keys;delete partial.checkpoint_awake;
 const {restore}=install(partial);
 const quiet=console.error;console.error=()=>{};
 try{
  const own=await (await readSettings(getRequest('/api/settings'))).json();
  assert.equal(own.missLog.hasKey,false);
  assert.equal(own.missLog.keyCreatedAt,null);
  assert.equal(own.missLog.connected,true,'a study sync alone still proves Miss Log reached us');
  assert.equal(own.share_awake,true);
 }finally{restore();console.error=quiet}
});
test('share_awake false is read server-side, so the awake boolean is never computed or shipped',async()=>{
 const off=install(world({share_awake:false}));
 try{
  const board=await getBoard(null,'gir',null);
  assert.equal(board.awake,false,'the toggle is off, so the family sees nothing');
  assert.ok(!off.calls.some(call=>call.table==='checkpoint_awake'&&call.query.get('select')==='post_day'),'the awake row must not even be read');
  assert.equal(board.connected,true,'only awake is gated; connected is a different pill');
 }finally{off.restore()}
 const on=install(world({share_awake:true}));
 try{
  const board=await getBoard(null,'gir',null);
  assert.equal(board.awake,true);
  assert.ok(on.calls.some(call=>call.table==='checkpoint_awake'&&call.query.get('select')==='post_day'));
 }finally{on.restore()}
 // No column at all is a database without supabase/migrations/006, which must behave as it does today.
 const legacy=world();for(const row of legacy.checkpoint_users)delete row.share_awake;
 const before=install(legacy);
 try{assert.equal((await getBoard(null,'gir',null)).awake,true,'an absent column must not read as "off"')}finally{before.restore()}
});
test('the public board carries the owner’s family note and never his share_awake setting',async()=>{
 const {restore}=install(world());
 try{
  const board=await getBoard(null,'gir',null);
  assert.equal(board.familyNote,'A window into my day.');
  for(const user of board.users)assert.ok(!('share_awake' in user),'a setting is not board data');
  assert.ok(!JSON.stringify(board).includes('share_awake'));
  assert.deepEqual(Object.keys(board.users[0]).sort(),['display_name','family_note','time_zone','username']);
 }finally{restore()}
 const blank=world({family_note:null});
 const {restore:restoreBlank}=install(blank);
 try{assert.equal((await getBoard(null,'gir',null)).familyNote,null,'no note means the board uses its own line')}finally{restoreBlank()}
});
test('a deploy that lands before supabase/migrations/006 keeps the public board up',async()=>{
 // PostgREST answers 400 with SQLSTATE 42703 for a column it does not know, NOT the 404 that
 // notMigrated() reads, so this is the one failure that would otherwise take the family's homepage
 // down for the minutes between a deploy and its migration.
 const legacy=world();for(const row of legacy.checkpoint_users){delete row.family_note;delete row.share_awake}
 const {calls,restore}=install(legacy);
 const previous=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);
  if(u.pathname.endsWith('checkpoint_users')&&(options.method||'GET')==='GET'&&(u.searchParams.get('select')||'').includes('family_note'))
   return Response.json({code:'42703',message:'column checkpoint_users.family_note does not exist'},{status:400});
  return previous(url,options);
 };
 const quiet=console.error;console.error=()=>{};
 try{
  const board=await getBoard(null,'gir',null);
  assert.equal(board.familyNote,null,'no column means the board falls back to its own line');
  assert.equal(board.awake,true,'and an unreadable toggle must not read as "off"');
  assert.equal(board.displayName,'Varun');
  assert.ok(calls.some(call=>call.table==='checkpoint_users'&&call.query.get('select')==='username,display_name,time_zone'),'the pre-006 select is retried');
  const own=await (await readSettings(getRequest('/api/settings'))).json();
  assert.equal(own.time_zone,zone,'Settings still shows the owner his own time zone');
  assert.equal(own.family_note,null);assert.equal(own.share_awake,true);
  // A 400 that is NOT an unknown column is still a fault and must not be swallowed as "no columns".
  globalThis.fetch=async(url,options={})=>{
   const u=new URL(url);
   if(u.pathname.endsWith('checkpoint_users')&&(options.method||'GET')==='GET')return Response.json({code:'PGRST100',message:'unparsable'},{status:400});
   return previous(url,options);
  };
  await assert.rejects(()=>getBoard(null,'gir',null),{status:502});
 }finally{globalThis.fetch=previous;restore();console.error=quiet}
});
test('validateDisplayName holds the 1-60 bound the database CHECK holds',()=>{
 assert.equal(validateDisplayName('  Varun  '),'Varun');
 assert.equal(validateDisplayName('x'.repeat(60)).length,60);
 for(const value of ['','   ','x'.repeat(61),null,undefined,42,{},['Varun']])assert.throws(()=>validateDisplayName(value),/1 to 60 characters/,String(value));
});
test('validateFamilyNote collapses the line, bounds it, and folds empty to null',()=>{
 assert.equal(validateFamilyNote('  A little window into my day.  '),'A little window into my day.');
 assert.equal(validateFamilyNote('one\nline\tnow'),'one line now','a public line stays one line');
 assert.equal(validateFamilyNote(''),null);
 assert.equal(validateFamilyNote('   '),null);
 assert.equal(validateFamilyNote(null),null);
 assert.equal(validateFamilyNote(undefined),null);
 assert.equal(validateFamilyNote('x'.repeat(FAMILY_NOTE_MAX)).length,FAMILY_NOTE_MAX);
 // Length is measured AFTER collapsing, or 140 newlines would pass and then push the page down.
 assert.equal(validateFamilyNote('a'+'\n'.repeat(400)+'b'),'a b');
 for(const value of ['x'.repeat(FAMILY_NOTE_MAX+1),42,{},['note'],true])assert.throws(()=>validateFamilyNote(value),new RegExp('up to '+FAMILY_NOTE_MAX+' characters'),String(value));
});
test('validateShareAwake takes a boolean and refuses anything it would have to coerce',()=>{
 assert.equal(validateShareAwake(true),true);
 assert.equal(validateShareAwake(false),false);
 for(const value of ['true','false','','0',0,1,null,undefined,{},[]])assert.throws(()=>validateShareAwake(value),/whether to share/,String(value));
});
test('POST /api/settings writes the new branches and leaves time zone and breaks alone',async()=>{
 const tables=world();
 const {calls,restore}=install(tables);
 const row=()=>tables.checkpoint_users.find(user=>user.username==='gir');
 try{
  assert.deepEqual(await (await writeSettings(postRequest('/api/settings',{display_name:'  Varun A.  '}))).json(),{ok:true,display_name:'Varun A.'});
  assert.equal(row().display_name,'Varun A.');
  assert.deepEqual(await (await writeSettings(postRequest('/api/settings',{family_note:'Reading more this week.'}))).json(),{ok:true,family_note:'Reading more this week.'});
  assert.equal(row().family_note,'Reading more this week.');
  assert.deepEqual(await (await writeSettings(postRequest('/api/settings',{family_note:''}))).json(),{ok:true,family_note:null},'empty clears the note');
  assert.equal(row().family_note,null);
  assert.deepEqual(await (await writeSettings(postRequest('/api/settings',{share_awake:false}))).json(),{ok:true,share_awake:false});
  assert.equal(row().share_awake,false);
  // Unchanged branches, byte for byte: the time zone still normalizes and the break still writes.
  assert.deepEqual(await (await writeSettings(postRequest('/api/settings',{time_zone:'america/new_york'}))).json(),{ok:true,time_zone:zone});
  const until=new Date(today+'T12:00:00Z');until.setUTCDate(until.getUTCDate()+3);
  assert.equal((await writeSettings(postRequest('/api/settings',{holiday:true,until:until.toISOString().slice(0,10)}))).status,200);
  assert.ok(calls.some(call=>call.table==='checkpoint_breaks'&&call.method==='POST'));
  // Bad values are a 400 from the validator, and nothing is written.
  for(const body of [{display_name:''},{display_name:'x'.repeat(61)},{family_note:'x'.repeat(FAMILY_NOTE_MAX+1)},{share_awake:'false'},{time_zone:'Mars/Olympus'}])
   assert.equal((await writeSettings(postRequest('/api/settings',body))).status,400,JSON.stringify(body));
  assert.equal((await writeSettings(postRequest('/api/settings',{nothing:1}))).status,400);
  assert.equal((await writeSettings(postRequest('/api/settings',{display_name:'Someone'},null))).status,401);
 }finally{restore()}
});
test('POST /api/settings writes only the session’s own row, whatever the body names',async()=>{
 const tables=world();
 const {calls,restore}=install(tables);
 try{
  assert.equal((await writeSettings(postRequest('/api/settings',{username:'mum',user:'mum',family_note:'Not hers to write.'}))).status,200);
  assert.equal(tables.checkpoint_users.find(user=>user.username==='gir').family_note,'Not hers to write.');
  assert.equal(tables.checkpoint_users.find(user=>user.username==='mum').family_note,null,'@mum’s row is untouched');
  for(const call of calls)if(call.method==='PATCH')assert.equal(call.query.get('username'),'eq.gir');
 }finally{restore()}
});
test('GET /api/export returns the owner’s own four tables as JSON, with no awake times by default',async()=>{
 const {restore}=install(world());
 try{
  const response=await exportOwn(getRequest('/api/export'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Content-Type'),'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.match(response.headers.get('Content-Disposition'),/^attachment; filename="checkpoint-gir-\d{4}-\d{2}-\d{2}\.json"$/);
  const text=await response.text(),data=JSON.parse(text);
  assert.deepEqual(Object.keys(data).sort(),['breaks','generated_at','includes_awake','posted_days','posts','study_days','username']);
  assert.equal(data.username,'gir');
  assert.equal(data.includes_awake,false);
  assert.equal(data.posts.length,1);
  assert.deepEqual(Object.keys(data.posts[0]).sort(),['cards_reviewed','correct','created_at','id','message','minutes','post_day','questions','sessions','target_hit','target_minutes'].sort());
  assert.deepEqual(data.study_days[0].minutes,90,'the study jsonb is flattened to counts');
  assert.deepEqual(data.posted_days,[{post_day:today}]);
  assert.deepEqual(data.breaks,[{start_day:today,until_day:today}]);
  assert.ok(!('awake' in data),'no awake section unless it was asked for');
  for(const banned of ['awake_at','last_active_at','still_up'])assert.ok(!text.includes(banned),banned+' must be opt-in, never the default');
  assert.equal((await exportOwn(getRequest('/api/export',null))).status,401);
  assert.equal((await exportOwn(getRequest('/api/export?format=xml'))).status,400);
 }finally{restore()}
});
test('GET /api/export includes the awake times only when they are explicitly asked for',async()=>{
 const {restore}=install(world());
 try{
  for(const flag of ['1','true','yes','on']){
   const data=JSON.parse(await (await exportOwn(getRequest('/api/export?awake='+flag))).text());
   assert.equal(data.includes_awake,true,flag);
   assert.equal(data.awake.length,1,flag);
   assert.deepEqual(Object.keys(data.awake[0]).sort(),['awake_at','last_active_at','post_day','received_at','still_up']);
   assert.equal(data.awake[0].awake_at,'2026-10-16T07:12:00+00:00');
  }
  for(const flag of ['0','false','no','']){
   const text=await (await exportOwn(getRequest('/api/export?awake='+flag))).text();
   assert.ok(!text.includes('awake_at'),'awake='+flag+' is not consent');
  }
 }finally{restore()}
});
test('GET /api/export writes a sectioned, RFC 4180 CSV and quotes a message that would break a row',async()=>{
 const {restore}=install(world());
 try{
  const response=await exportOwn(getRequest('/api/export?format=csv'));
  assert.equal(response.headers.get('Content-Type'),'text/csv; charset=utf-8');
  assert.match(response.headers.get('Content-Disposition'),/\.csv"$/);
  const csv=await response.text();
  for(const section of ['# posts','# study_days','# posted_days','# breaks'])assert.ok(csv.includes(section+'\r\n'),section);
  assert.ok(!csv.includes('# awake'),'the awake section is opt-in in CSV too');
  for(const banned of ['awake_at','last_active_at'])assert.ok(!csv.includes(banned),banned);
  assert.ok(csv.includes('id,post_day,created_at,message,minutes,sessions,questions,correct,cards_reviewed,target_minutes,target_hit\r\n'));
  assert.ok(csv.includes('start_day,until_day\r\n'+today+','+today+'\r\n'));
  // The seeded message holds a comma, a double quote and a CRLF, so an unquoted cell would silently
  // turn one post into three rows with the wrong column count.
  assert.ok(csv.includes('"He said ""hello"", then left\r\nand came back."'),'the message cell is quoted and its quotes doubled');
  const withAwake=await (await exportOwn(getRequest('/api/export?format=csv&awake=1'))).text();
  assert.ok(withAwake.includes('# awake\r\npost_day,awake_at,last_active_at,still_up,received_at\r\n'));
 }finally{restore()}
});
test('GET /api/export pages the history instead of building one unbounded string',async()=>{
 const tables=world();
 tables.checkpoint_posts=Array.from({length:2300},(_,i)=>({id:'11111111-1111-4111-8111-'+String(i).padStart(12,'0'),username:'gir',message:'Day '+i,created_at:'2026-01-01T00:00:00+00:00',post_day:today,study:null}));
 const {calls,restore}=install(tables);
 try{
  const data=JSON.parse(await (await exportOwn(getRequest('/api/export'))).text());
  assert.equal(data.posts.length,2300);
  const offsets=calls.filter(call=>call.table==='checkpoint_posts'&&call.query.get('limit')==='1000').map(call=>call.query.get('offset'));
  assert.deepEqual(offsets,['0','1000','2000'],'one bounded page per request, never the whole table at once');
 }finally{restore()}
});
test('POST /api/signout with {all:true} ends every device of that username, and only that username',async()=>{
 const tables=world();
 const {calls,restore}=install(tables);
 try{
  const response=await signout(postRequest('/api/signout',{all:true}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,all:true});
  assert.match(response.headers.get('Set-Cookie'),/^checkpoint_session=; HttpOnly/);
  assert.deepEqual(tables.checkpoint_sessions.map(row=>row.username),['mum'],'all three of @gir’s rows are gone, @mum’s is not');
  const sweep=calls.find(call=>call.table==='checkpoint_sessions'&&call.method==='DELETE');
  assert.equal(sweep.query.get('username'),'eq.gir','the username comes from the session, never the body');
  assert.ok(!sweep.query.has('token_hash'),'sign out everywhere is not "every other device"');
 }finally{restore()}
});
test('POST /api/signout without {all:true} still ends only this device',async()=>{
 const tables=world();
 const {restore}=install(tables);
 try{
  assert.deepEqual(await (await signout(postRequest('/api/signout',{}))).json(),{ok:true,all:false});
  assert.deepEqual(tables.checkpoint_sessions.map(row=>row.token_hash),[OTHER_HASH,THIRD_HASH,MUM_HASH]);
  // No body at all, and a body that is not JSON, must both still sign this device out.
  const bare=new Request('https://checkpoint.test/api/signout',{method:'POST',headers:{Cookie:'checkpoint_session='+OTHER}});
  assert.equal((await signout(bare)).status,200);
  assert.deepEqual(tables.checkpoint_sessions.map(row=>row.token_hash),[THIRD_HASH,MUM_HASH]);
  const junk=new Request('https://checkpoint.test/api/signout',{method:'POST',headers:{Cookie:'checkpoint_session='+THIRD,'Content-Type':'application/json'},body:'{'});
  assert.equal((await signout(junk)).status,200);
  assert.deepEqual(tables.checkpoint_sessions.map(row=>row.token_hash),[MUM_HASH]);
 }finally{restore()}
});
test('a signed-out {all:true} clears the cookie without a sweep it cannot attribute',async()=>{
 const tables=world();
 const {calls,restore}=install(tables);
 try{
  const response=await signout(postRequest('/api/signout',{all:true},'f'.repeat(64)));
  assert.equal(response.status,200);
  assert.equal(tables.checkpoint_sessions.length,4,'an unknown token names no username, so nothing is revoked');
  assert.ok(!calls.some(call=>call.table==='checkpoint_sessions'&&call.method==='DELETE'&&!call.query.has('token_hash')));
 }finally{restore()}
});
