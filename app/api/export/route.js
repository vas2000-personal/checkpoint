import {database,json,fail,notMigrated,studyDay} from '../../../lib/server.js';
import {currentUser} from '../../../lib/sessions.js';
export const dynamic='force-dynamic';
// SELF ONLY, session-derived, under exactly the rules at the top of app/api/settings/route.js: the
// username comes from currentUser(request) and NEVER from the query or the body, and nothing here
// may be added to getBoard or /api/board.
//
// AWAKE AND LAST-ACTIVE TIMESTAMPS ARE EXCLUDED BY DEFAULT, and the default is the whole point. They
// are the owner's own data, so he is allowed to ask for them with ?awake=1 — but an export is the one
// artefact that leaves the browser as a FILE: it gets mailed to a parent, pasted into a chat, synced
// to a shared drive, handed to whoever asked for it. Every other surface the privacy contract guards
// is read once behind a session; this one is copied. Those two columns are the ones that say when a
// seventeen-year-old was asleep and when he stopped moving the mouse, so they are opt-in on each
// request and never remembered. Opt-in, never opt-out.
const PAGE=1000;
// The owner's history grows for years, so nothing here is concatenated into one string: each page of
// rows is encoded and handed to the stream, and the page itself is the only thing ever in memory.
// The cost of streaming is that a database failure after the first chunk cannot become a clean 502 —
// the download simply truncates — so the FIRST page of the first section is fetched before any
// header is written, which is what turns the common failure (no config, no table, dead pool) back
// into a normal error response.
async function* pages(section,username){
 for(let offset=0;;offset+=PAGE){
  let rows;
  try{rows=await database(section.table+'?'+new URLSearchParams({select:section.select,username:'eq.'+username,order:section.order,limit:String(PAGE),offset:String(offset)}))}
  catch(error){if(notMigrated(error))return;throw error}
  if(!rows?.length)return;
  yield rows;
  if(rows.length<PAGE)return;
 }
}
// The same count whitelist lib/board.js applies on the way out: a topic, a note or question text that
// a direct database write put inside the study jsonb must not ride out in an export either.
const COUNTS=['minutes','sessions','questions','correct','cards_reviewed','target_minutes','target_hit'];
const counts=study=>Object.fromEntries(COUNTS.map(k=>[k,study?.[k]??null]));
const SECTIONS=[
 {name:'posts',table:'checkpoint_posts',select:'id,post_day,created_at,message,study',order:'created_at.asc,id.asc',
  columns:['id','post_day','created_at','message',...COUNTS],
  row:r=>({id:r.id,post_day:r.post_day,created_at:r.created_at,message:r.message,...counts(r.study)})},
 {name:'study_days',table:'checkpoint_study_days',select:'post_day,message,study,source_updated_at,received_at',order:'post_day.asc',
  columns:['post_day','message','source_updated_at','received_at',...COUNTS],
  row:r=>({post_day:r.post_day,message:r.message,source_updated_at:r.source_updated_at,received_at:r.received_at,...counts(r.study)})},
 {name:'posted_days',table:'checkpoint_days',select:'post_day',order:'post_day.asc',columns:['post_day'],row:r=>({post_day:r.post_day})},
 {name:'breaks',table:'checkpoint_breaks',select:'start_day,until_day',order:'start_day.asc',columns:['start_day','until_day'],
  row:r=>({start_day:r.start_day,until_day:r.until_day})}
];
const AWAKE={name:'awake',table:'checkpoint_awake',select:'post_day,awake_at,last_active_at,still_up,received_at',order:'post_day.asc',
 columns:['post_day','awake_at','last_active_at','still_up','received_at'],
 row:r=>({post_day:r.post_day,awake_at:r.awake_at,last_active_at:r.last_active_at,still_up:r.still_up,received_at:r.received_at})};
// RFC 4180: quote whenever a comma, a quote, a newline or an edge space would otherwise change the
// shape of the row, and double an embedded quote. A post message is free text, so this is load-bearing.
const cell=value=>{
 if(value===null||value===undefined)return '';
 const text=String(value);
 return /[",\r\n]/.test(text)||text!==text.trim()?'"'+text.split('"').join('""')+'"':text;
};
async function* jsonBody(sections,username,now,withAwake){
 yield '{"username":'+JSON.stringify(username)+',"generated_at":'+JSON.stringify(now.toISOString())+',"includes_awake":'+withAwake;
 for(const section of sections){
  yield ',"'+section.name+'":[';
  let first=true;
  for await(const page of pages(section,username))for(const row of page){yield (first?'':',')+JSON.stringify(section.row(row));first=false}
  yield ']';
 }
 yield '}';
}
async function* csvBody(sections,username){
 let firstSection=true;
 for(const section of sections){
  // A sectioned CSV, because the four tables share no columns: a blank line, a "# name" marker and a
  // fresh header row, which is what every spreadsheet needs to be told a new table has started.
  yield (firstSection?'':'\r\n')+'# '+section.name+'\r\n'+section.columns.join(',')+'\r\n';
  firstSection=false;
  for await(const page of pages(section,username))for(const row of page){const flat=section.row(row);yield section.columns.map(column=>cell(flat[column])).join(',')+'\r\n'}
 }
}
const TRUTHY=new Set(['1','true','yes','on']);
export async function GET(request){
 try{
  const user=await currentUser(request);if(!user)return json({error:'Please sign in.'},401);
  const params=new URL(request.url).searchParams,format=(params.get('format')||'json').toLowerCase();
  if(format!=='json'&&format!=='csv')return json({error:'Choose json or csv.'},400);
  const withAwake=TRUTHY.has(String(params.get('awake')||'').toLowerCase());
  const sections=withAwake?[...SECTIONS,AWAKE]:SECTIONS;
  const username=user.username,now=new Date();
  // Proves the database answers before a single header is committed; see the note on pages() above.
  await database('checkpoint_posts?'+new URLSearchParams({select:'id',username:'eq.'+username,limit:'1'}));
  const body=format==='csv'?csvBody(sections,username):jsonBody(sections,username,now,withAwake);
  const encoder=new TextEncoder();
  const stream=new ReadableStream({async pull(controller){
   const {value,done}=await body.next();
   if(done)return controller.close();
   controller.enqueue(encoder.encode(value));
  },cancel(){body.return?.()}});
  const name='checkpoint-'+username+'-'+studyDay(now,user.time_zone)+'.'+format;
  return new Response(stream,{status:200,headers:{
   'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8',
   'Content-Disposition':'attachment; filename="'+name+'"',
   'Cache-Control':'no-store'
  }});
 }catch(error){return fail(error)}
}
