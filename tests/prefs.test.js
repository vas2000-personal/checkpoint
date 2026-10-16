import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS,SCALES,ACCENTS,MOTION,CLOCKS,MEASURES,STAMPED,STORAGE_KEY,normalize,serialize,attrs,read,write,WIDGET_PREFIX,RETIRED_WIDGETS,LIVE_WIDGETS,CLEANUP_KEY,CLEANUP_VERSION,cleanupWidgetKeys} from '../lib/prefs.js';
import {TABS,isTab} from '../lib/tabs.js';

// Every stored shape that has ever been in a visitor's localStorage, plus the ones an attacker or a
// half-finished write could leave. 'null' is the one that used to take the boot script down.
const HOSTILE=[null,undefined,'','{}','null','"null"','0','false','[]','[1,2]','"not json at all','{"dark":1}',
 '{"dark":true}','{"scale":"huge"}','{"accent":"#ff0000"}','{"accent":"rebeccapurple"}','{"reduceMotion":"maybe"}',
 '{"clock":24}','{"defaultTab":"nope"}','{"chartMeasure":"cards"}','{"__proto__":{"dark":true}}',
 {dark:'true'},{scale:null},{accent:0},[],42,true,()=>{}];

test('the defaults are the shipped look and every key has a known domain',()=>{
 assert.deepEqual(Object.keys(DEFAULTS).sort(),['accent','chartMeasure','clock','compactFeed','contrast','dark','defaultTab','focus','reduceMotion','scale'].sort());
 assert.deepEqual(DEFAULTS,{dark:false,contrast:false,focus:false,scale:'normal',accent:'forest',reduceMotion:'system',compactFeed:false,clock:'12',defaultTab:'today',chartMeasure:'minutes'});
 assert.deepEqual(normalize(null),DEFAULTS,'an empty device must read exactly the defaults');
 // reduceMotion must stay tri-state: a boolean would override an OS that already asks for less motion.
 assert.deepEqual(MOTION,['system','on','off']);
 assert.equal(DEFAULTS.reduceMotion,'system','the default must defer to prefers-reduced-motion');
 assert.equal(ACCENTS[0],'forest','the first accent is the color the stylesheet already ships');
 assert.ok(ACCENTS.length>1&&ACCENTS.length<=8,'a curated set, not a free hue: each one is contrast-checked per theme');
 for(const list of [SCALES,ACCENTS,MOTION,CLOCKS,MEASURES]){
  assert.equal(new Set(list).size,list.length,'a duplicated slug would make two settings collide');
  for(const slug of list)assert.match(slug,/^[a-z0-9]+$/,'slugs are data-attribute values: '+slug);
 }
 assert.equal(isTab(DEFAULTS.defaultTab),true,'defaultTab must name a real tab');
});

test('normalize returns a complete known-good object for every junk shape',()=>{
 for(const raw of HOSTILE){
  const out=normalize(raw);
  assert.deepEqual(Object.keys(out).sort(),Object.keys(DEFAULTS).sort(),'stored '+JSON.stringify(raw)+' lost keys');
  for(const key of Object.keys(DEFAULTS))
   assert.equal(typeof out[key],typeof DEFAULTS[key],'stored '+JSON.stringify(raw)+' changed the type of '+key);
  assert.equal(SCALES.includes(out.scale),true);
  assert.equal(ACCENTS.includes(out.accent),true,'stored '+JSON.stringify(raw)+' produced accent '+out.accent);
  assert.equal(MOTION.includes(out.reduceMotion),true);
  assert.equal(CLOCKS.includes(out.clock),true);
  assert.equal(MEASURES.includes(out.chartMeasure),true);
  assert.equal(TABS.includes(out.defaultTab),true);
 }
 // A literal "null": JSON.parse gives null, and the old boot script threw reading s.dark off it.
 assert.deepEqual(normalize('null'),DEFAULTS);
 assert.deepEqual(normalize('"null"'),DEFAULTS);
 // Strings are not booleans. '{"dark":"yes"}' reading as dark would turn a setting ON from junk.
 assert.equal(normalize('{"dark":"true"}').dark,false);
 assert.equal(normalize('{"compactFeed":1}').compactFeed,false);
 assert.equal(normalize({dark:true,contrast:true,focus:true,compactFeed:true}).dark,true);
 // An unconstrained color is exactly what the curated list exists to refuse.
 assert.equal(normalize('{"accent":"#ff0000"}').accent,'forest');
 assert.equal(normalize('{"accent":"ocean"}').accent,'ocean');
 assert.equal(normalize('{"__proto__":{"dark":true}}').dark,false,'a prototype payload must not become a setting');
 assert.equal(Object.getPrototypeOf(normalize('{"__proto__":{"dark":true}}')),Object.prototype);
 // Idempotent, and tolerant of its own output: the settings UI normalizes on every keystroke.
 const once=normalize({dark:true,scale:'large',accent:'plum',clock:'24'});
 assert.deepEqual(normalize(once),once);
 assert.deepEqual(normalize(serialize(once)),once);
});

test('an older stored object keeps its settings and gains the new ones',()=>{
 // What a device that last visited before this phase actually holds: the original four keys only.
 const old='{"dark":true,"contrast":false,"focus":true,"scale":"small"}';
 assert.deepEqual(normalize(old),{...DEFAULTS,dark:true,focus:true,scale:'small'},'an upgrade must not reset the owner');
 // The one older reduceMotion in the wild was a boolean; true meant "reduce".
 assert.equal(normalize('{"reduceMotion":true}').reduceMotion,'on');
 assert.equal(normalize('{"reduceMotion":false}').reduceMotion,'off');
 assert.equal(normalize('{"reduceMotion":"system"}').reduceMotion,'system');
 // Unknown keys from a newer build are dropped rather than carried into the attributes.
 assert.equal('somethingElse' in normalize('{"somethingElse":true,"dark":true}'),false);
});

test('serialize round-trips and read/write survive a hostile storage',()=>{
 const value=normalize({dark:true,scale:'large',accent:'clay',reduceMotion:'off',compactFeed:true,clock:'24',defaultTab:'study',chartMeasure:'questions'});
 assert.deepEqual(JSON.parse(serialize(value)),value);
 assert.deepEqual(normalize(serialize(value)),value);
 const store=new Map();
 const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 assert.deepEqual(write(storage,value),value);
 assert.equal(store.get(STORAGE_KEY),serialize(value));
 assert.deepEqual(read(storage),value);
 // Safari private mode throws on both halves; a settings page must not crash on a saved preference.
 const angry={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')},removeItem(){throw new Error('denied')}};
 assert.deepEqual(read(angry),DEFAULTS);
 assert.deepEqual(write(angry,value),value);
 assert.deepEqual(read(undefined),DEFAULTS);
});

test('the one-time cleanup removes retired widget keys and nothing else',()=>{
 const store=new Map();
 const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 assert.deepEqual(RETIRED_WIDGETS.filter(name=>LIVE_WIDGETS.includes(name)),[],'a key cannot be retired and live at once');
 for(const name of [...RETIRED_WIDGETS,...LIVE_WIDGETS])store.set(WIDGET_PREFIX+name,'open');
 store.set('checkpoint-display','{"dark":true}');
 store.set('checkpoint-widget:some-card-a-later-phase-adds','closed');
 const removed=cleanupWidgetKeys(storage);
 assert.deepEqual(removed.sort(),RETIRED_WIDGETS.map(name=>WIDGET_PREFIX+name).sort());
 for(const name of LIVE_WIDGETS)assert.equal(store.get(WIDGET_PREFIX+name),'open','a surviving widget lost its remembered state: '+name);
 assert.equal(store.get('checkpoint-widget:some-card-a-later-phase-adds'),'closed','cleanup must not be a prefix sweep');
 assert.equal(store.get('checkpoint-display'),'{"dark":true}','display preferences are not widget state');
 for(const name of RETIRED_WIDGETS)assert.equal(store.has(WIDGET_PREFIX+name),false);
 // One-time: a second call is a no-op even after the keys come back (another tab, a restored profile).
 assert.equal(store.get(CLEANUP_KEY),CLEANUP_VERSION);
 store.set(WIDGET_PREFIX+RETIRED_WIDGETS[0],'open');
 assert.deepEqual(cleanupWidgetKeys(storage),[]);
 assert.equal(store.get(WIDGET_PREFIX+RETIRED_WIDGETS[0]),'open');
 // Nothing to remove is not an error, and a thrown storage is not either.
 const fresh=new Map(),clean={getItem:k=>fresh.has(k)?fresh.get(k):null,setItem:(k,v)=>fresh.set(k,v),removeItem:k=>fresh.delete(k)};
 assert.deepEqual(cleanupWidgetKeys(clean),[]);
 assert.equal(fresh.get(CLEANUP_KEY),CLEANUP_VERSION);
 assert.deepEqual(cleanupWidgetKeys({getItem(){throw new Error('denied')}}),[]);
 assert.deepEqual(cleanupWidgetKeys(undefined),[]);
});

// ---------------------------------------------------------------------------------------------
// The blocking boot script is an inline STRING: it cannot import lib/prefs.js, so it is a second
// copy of this shape by construction. Run the real string against stub globals and assert it
// writes exactly attrs(normalize(x)). This test is the reason the duplication is allowed to exist.
// ---------------------------------------------------------------------------------------------
const layout=readFileSync(new URL('../app/layout.jsx',import.meta.url),'utf8');
const bootScript=/dangerouslySetInnerHTML=\{\{__html:"([^"]*)"\}\}/.exec(layout)[1].replace(/\\'/g,"'");
function boot(stored,{meta=true}={}){
 const element={dataset:{}},tag={content:'#f6f5ef'};let observed=null;
 const localStorage={getItem:()=>stored===undefined?null:stored};
 const document={documentElement:element,querySelector:sel=>sel==='meta[name=theme-color]'&&meta?tag:null};
 class MutationObserver{constructor(fn){this.fn=fn}observe(target,options){observed={target,options}}}
 new Function('localStorage','document','MutationObserver',bootScript)(localStorage,document,MutationObserver);
 return {dataset:element.dataset,content:tag.content,observed};
}
test('the boot script and lib/prefs.js agree on every stored shape',()=>{
 assert.match(bootScript,/^try\{[\s\S]*\}catch\{\}$/,'the whole body must stay inside one try/catch');
 assert.doesNotMatch(bootScript,/\bimport\b|\brequire\(/,'an inline blocking script cannot import');
 for(const raw of HOSTILE){
  if(typeof raw==='function')continue; // localStorage can only ever hand back a string or null
  const stored=typeof raw==='string'||raw===null||raw===undefined?raw:JSON.stringify(raw);
  const {dataset,observed}=boot(stored);
  assert.deepEqual({...dataset},attrs(stored),'stored '+JSON.stringify(stored)+': the script and normalize() disagree');
  assert.deepEqual(Object.keys(dataset).sort(),[...STAMPED].sort(),'stored '+JSON.stringify(stored)+' stamped the wrong attribute set');
  assert.ok(observed,'stored '+JSON.stringify(stored)+' never registered the MutationObserver');
 }
 // The attributes the stylesheet selects on, spelled as they appear in the HTML.
 assert.deepEqual({...boot('{"dark":true,"scale":"large","accent":"plum","reduceMotion":"on"}').dataset},
  {dark:'true',contrast:'false',focus:'false',scale:'large',accent:'plum',reduceMotion:'on'});
 assert.deepEqual({...boot('null').dataset},attrs(null),'a stored literal null must fall back to defaults, not abort the script');
 // Accent and motion must survive a missing meta tag, exactly as dark/scale already do.
 const headless=boot('{"accent":"ocean","reduceMotion":"off"}',{meta:false});
 assert.equal(headless.dataset.accent,'ocean');
 assert.equal(headless.dataset.reduceMotion,'off');
 assert.ok(headless.observed);
 // Every slug the module accepts must be a slug the script accepts, or the first paint differs.
 for(const accent of ACCENTS)assert.equal(boot(JSON.stringify({accent})).dataset.accent,accent,'the script dropped accent '+accent);
 for(const value of MOTION)assert.equal(boot(JSON.stringify({reduceMotion:value})).dataset.reduceMotion,value);
 for(const scale of SCALES)assert.equal(boot(JSON.stringify({scale})).dataset.scale,scale);
 // theme-color still tracks dark/contrast only, so an accent change cannot repaint the browser chrome.
 assert.equal(boot('{"dark":true}').content,'#14221b');
 assert.equal(boot('{"accent":"clay"}').content,'#f6f5ef');
});

// ---------------------------------------------------------------------------------------------
// THE RETIREMENT HAS TO MATCH REALITY. The cleanup deletes checkpoint-widget:<name> by hand-written
// name, and it ran while the board still rendered two of those cards: the keys came back collapsed
// and a visitor's open/closed state was silently wiped. The guard is not a longer list, it is
// reading the components and refusing to let the two drift, in either direction.
// ---------------------------------------------------------------------------------------------
const components=['widget.jsx','study.jsx','dashboard.jsx','feed.jsx','hero.jsx','adventure.jsx','scoreboard.jsx',
 'week-widget.jsx','site-header.jsx','entry-dialog.jsx','board-tabs.jsx','remembered-details.jsx',
 'tabs/today-panel.jsx','tabs/journal-panel.jsx','tabs/progress-panel.jsx']
 .map(name=>readFileSync(new URL('../components/'+name,import.meta.url),'utf8')).join('\n');
// Every remembered disclosure is <RememberedDetails storageKey="..."> or a <Widget title="...">,
// whose storageKey IS its title (components/widget.jsx).
const rendered=new Set([...components.matchAll(/storageKey="([^"]*)"/g),...components.matchAll(/<Widget title="([^"]*)"/g)].map(m=>m[1]));
test('the retired widget list matches the cards the board actually renders',()=>{
 assert.ok(rendered.size>=3,'the storageKey scan found nothing: '+[...rendered]);
 assert.deepEqual([...rendered].sort(),[...LIVE_WIDGETS].sort(),'LIVE_WIDGETS is not the set of remembered cards on the board');
 // The whole failure mode: a retired key that something still renders is state wiped on first load.
 for(const name of RETIRED_WIDGETS)assert.equal(rendered.has(name),false,'the board still renders the retired card '+name);
 assert.deepEqual(RETIRED_WIDGETS.filter(name=>LIVE_WIDGETS.includes(name)),[],'a key cannot be retired and live at once');
 assert.equal(new Set(RETIRED_WIDGETS).size,RETIRED_WIDGETS.length);
 // The two cards that moved to /settings must be retired, not merely absent from LIVE.
 for(const moved of ['sign-in','profile-settings'])assert.ok(RETIRED_WIDGETS.includes(moved),moved+' moved to /settings and its key is orphaned');
 // A real storage, driven: the live keys survive and the retired ones go.
 const store=new Map(),storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 for(const name of [...rendered,...RETIRED_WIDGETS])store.set(WIDGET_PREFIX+name,'open');
 cleanupWidgetKeys(storage);
 for(const name of rendered)assert.equal(store.get(WIDGET_PREFIX+name),'open','a card still on the board lost its remembered state: '+name);
 for(const name of RETIRED_WIDGETS)assert.equal(store.has(WIDGET_PREFIX+name),false);
});
