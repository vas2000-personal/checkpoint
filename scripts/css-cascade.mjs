// Snapshot of every resolved CSS declaration, so splitting globals.css can be proved style-for-style identical.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),SHEET=resolve(ROOT,'app/globals.css'),FIXTURE=resolve(ROOT,'tests/fixtures/css-cascade.json');
// @media and friends wrap rules we still resolve; every other at-rule is an opaque body we only hash.
const DESCEND=new Set(['media','layer','container','scope']);
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,32);
const atName=prelude=>(prelude.match(/^@([\w-]+)/)||['',''])[1].toLowerCase();
const join=(ctx,at)=>ctx?ctx+' && '+at:at;
const key=(ctx,sel,prop)=>ctx+'||'+sel+'||'+prop;
// Length of the comment or string starting at i, so braces, commas and colons inside them never parse as syntax.
function scan(css,i) {
 const c=css[i];
 if(c==='/'&&css[i+1]==='*'){const end=css.indexOf('*/',i+2);return (end<0?css.length:end+2)-i}
 if(c==='"'||c==="'"){let j=i+1;while(j<css.length){if(css[j]==='\\'){j+=2;continue}const q=css[j++]===c;if(q)break}return j-i}
 return 0;
}
// Collapse whitespace outside strings; 'sel' and 'at' also squeeze the punctuation that carries no meaning.
function normalize(text,kind) {
 const tight=kind==='sel'?'>+~,':kind==='at'?'(),:':'';
 let out='',i=0,space=false;
 while(i<text.length){
  const n=scan(text,i);
  if(n){if(text[i]==='/'){space=true;i+=n;continue}if(space&&out)out+=' ';space=false;out+=text.slice(i,i+n);i+=n;continue}
  const c=text[i];
  if(/\s/.test(c)){space=true;i++;continue}
  if(space&&out&&!tight.includes(c)&&!tight.includes(out.at(-1)))out+=' ';
  space=false;out+=c;i++;
 }
 return kind==='at'?out.toLowerCase():out;
}
const value=text=>normalize(text,'value').replace(/\s*!\s*important$/i,' !important');
// Split a selector list on top-level commas only: this sheet's :is() lists are full of commas that must stay put.
function list(prelude) {
 const parts=[];let i=0,from=0,paren=0;
 while(i<prelude.length){
  const n=scan(prelude,i);if(n){i+=n;continue}
  const c=prelude[i];
  if(c==='(')paren++;else if(c===')')paren--;else if(c===','&&!paren){parts.push(prelude.slice(from,i));from=i+1}
  i++;
 }
 parts.push(prelude.slice(from));
 return parts.map(p=>normalize(p,'sel')).filter(Boolean);
}
function matchBrace(css,open,end) {
 let i=open+1,depth=1;
 while(i<end){const n=scan(css,i);if(n){i+=n;continue}const c=css[i];if(c==='{')depth++;else if(c==='}'&&!--depth)return i;i++}
 return end;
}
const colon=text=>{let i=0,paren=0;while(i<text.length){const n=scan(text,i);if(n){i+=n;continue}const c=text[i];if(c==='(')paren++;else if(c===')')paren--;else if(c===':'&&!paren)return i;i++}return -1};
function declare(decls,text) {
 const t=text.trim();if(!t)return;
 const at=colon(t);if(at<1)return;
 const prop=t.slice(0,at).trim(),v=value(t.slice(at+1));
 if(prop&&v)decls.push([prop.startsWith('--')?prop:prop.toLowerCase(),v]);
}
// A rule body is declarations plus, in nested sheets, further blocks.
function body(css,start,end) {
 const decls=[],nested=[];let i=start,from=start,paren=0;
 while(i<end){
  const n=scan(css,i);if(n){i+=n;continue}
  const c=css[i];
  if(c==='(')paren++;else if(c===')')paren--;
  else if(c===';'&&!paren){declare(decls,css.slice(from,i));from=i+1}
  else if(c==='{'&&!paren){const close=matchBrace(css,i,end);nested.push([css.slice(from,i).trim(),i+1,close]);i=close+1;from=i;continue}
  i++;
 }
 declare(decls,css.slice(from,end));
 return {decls,nested};
}
const blob=(out,stats,ctx,prelude,text)=>{stats.blobs++;out[key(ctx,prelude,'@body')]=hash(normalize(text,'value'))};
function rule(sels,css,start,end,ctx,out,stats) {
 stats.rules++;
 const {decls,nested}=body(css,start,end);
 for(const sel of sels)for(const [prop,v] of decls){stats.declarations++;out[key(ctx,sel,prop)]=v}
 for(const [prelude,s,e] of nested){
  if(prelude[0]!=='@'){rule(list(prelude).flatMap(p=>sels.map(s2=>p.includes('&')?p.replace(/&/g,s2):s2+' '+p)),css,s,e,ctx,out,stats);continue}
  const at=normalize(prelude,'at');
  if(DESCEND.has(atName(prelude)))rule(sels,css,s,e,join(ctx,at),out,stats);else blob(out,stats,ctx,sels.join(',')+' '+at,css.slice(s,e));
 }
}
function walk(css,start,end,ctx,out,stats) {
 let i=start,from=start,paren=0;
 while(i<end){
  const n=scan(css,i);if(n){i+=n;continue}
  const c=css[i];
  if(c==='(')paren++;else if(c===')')paren--;
  else if(c===';'&&!paren){from=i+1}
  else if(c==='{'&&!paren){
   const prelude=css.slice(from,i).trim(),close=matchBrace(css,i,end);
   if(prelude[0]==='@'){
    const at=normalize(prelude,'at');
    if(DESCEND.has(atName(prelude)))walk(css,i+1,close,join(ctx,at),out,stats);else blob(out,stats,ctx,at,css.slice(i+1,close));
   }else rule(list(prelude),css,i+1,close,ctx,out,stats);
   i=close+1;from=i;continue;
  }
  i++;
 }
}
const IMPORT=/@import\s+([^;]+);/g,REMOTE=/^(?:https?:)?\/\/|^data:/;
// Inline local @imports textually so the snapshot survives globals.css being split into several files.
function source(file,seen=new Set()) {
 const path=resolve(file);if(seen.has(path))return '';seen.add(path);
 const text=readFileSync(path,'utf8').replace(/^\uFEFF/,'');
 return text.replace(IMPORT,(whole,spec)=>{
  const target=(spec.match(/^url\(\s*(['"]?)([^'")]+)\1\s*\)/)||spec.match(/^(['"])([^'"]+)\1/)||[])[2];
  if(!target||REMOTE.test(target))return whole;
  const rest=spec.slice(spec.indexOf(target)+target.length).replace(/^['")\s]+/,'').trim(),inner=source(resolve(dirname(path),target),seen);
  return rest?'@media '+rest+'{'+inner+'}':inner;
 });
}
export function cascade(file=SHEET) {
 const map=Object.create(null),stats={rules:0,declarations:0,blobs:0},css=source(file);
 walk(css,0,css.length,'',map,stats);
 const out={};for(const k of Object.keys(map).sort())out[k]=map[k];
 stats.keys=Object.keys(out).length;stats.contexts=new Set(Object.keys(out).map(k=>k.slice(0,k.indexOf('||')))).size;
 return {map:out,stats};
}
// Every (context, selector, property) whose winning value moved between the fixture and the sheet.
export function drift(map,fixture) {
 const moved=[];
 for(const key of new Set([...Object.keys(fixture),...Object.keys(map)]))
  if(fixture[key]!==map[key])moved.push(key+': '+JSON.stringify(fixture[key])+' -> '+JSON.stringify(map[key]));
 return moved.sort();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {map,stats}=cascade();
 if(process.argv.includes('--write')){mkdirSync(dirname(FIXTURE),{recursive:true});writeFileSync(FIXTURE,JSON.stringify(map,null,2)+'\n');console.log('wrote '+FIXTURE)}
 console.log(stats.rules+' rules, '+stats.declarations+' declarations, '+stats.contexts+' contexts, '+stats.keys+' resolved keys, '+stats.blobs+' opaque blocks');
 // Without --write the command is an audit: a moved value is a failure, not a note.
 if(!process.argv.includes('--write')){
  const moved=drift(map,JSON.parse(readFileSync(FIXTURE,'utf8')));
  if(moved.length){
   console.error(moved.length+' resolved declarations changed — run `npm run css:snapshot` and review the diff, that diff IS the change under review:');
   for(const line of moved.slice(0,40))console.error('  '+line);
   if(moved.length>40)console.error('  …and '+(moved.length-40)+' more');
   process.exitCode=1;
  }else console.log('cascade matches '+FIXTURE);
 }
}
