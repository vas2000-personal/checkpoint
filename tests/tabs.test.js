import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TABS,DEFAULT_TAB,isTab,seedTab,parseTab,parseQuery,serializeQuery,tabHref} from '../lib/tabs.js';
import {DEFAULTS,STAMPED,normalize} from '../lib/prefs.js';
import {SLOTS} from '../components/tabs/slugs.js';

test('the tab list is a closed set of link-safe slugs',()=>{
 assert.deepEqual(TABS,['today','progress','study','settings']);
 assert.equal(TABS[0],DEFAULT_TAB,'the first tab is the one a bare / opens');
 assert.equal(new Set(TABS).size,TABS.length);
 for(const tab of TABS)assert.match(tab,/^[a-z][a-z0-9-]*$/,'a tab slug goes in a URL and a data attribute: '+tab);
 for(const tab of TABS)assert.equal(isTab(tab),true);
 for(const junk of ['','TODAY',' today','setting','../settings','today ',null,undefined,0,{},[],['today']])
  assert.equal(isTab(junk),false,'isTab accepted '+JSON.stringify(junk));
});

test('an unknown or missing tab falls back, and defaultTab seeds it',()=>{
 assert.equal(seedTab(undefined),DEFAULT_TAB);
 assert.equal(seedTab({}),DEFAULT_TAB);
 assert.equal(seedTab(DEFAULTS),DEFAULT_TAB);
 assert.equal(seedTab({defaultTab:'study'}),'study');
 // A junk pref cannot leave the board with nothing selected.
 for(const junk of [{defaultTab:'nope'},{defaultTab:null},{defaultTab:42},'study',null])
  assert.equal(seedTab(junk),DEFAULT_TAB,'seedTab('+JSON.stringify(junk)+') must still name a tab');
 assert.equal(seedTab(normalize('{"defaultTab":"settings"}')),'settings','the validated pref seeds the tab');
 // Case and whitespace are forgiven: a typed or shared link should still land.
 assert.equal(parseTab('Study'),'study');
 assert.equal(parseTab(' settings '),'settings');
 // Unknown values fall back to the SEED, not blindly to 'today': a renamed slug or an old bookmark is
 // still a visit, and where a visit lands is exactly what defaultTab decides.
 assert.equal(parseTab('nope',{defaultTab:'progress'}),'progress');
 assert.equal(parseTab(undefined,{defaultTab:'progress'}),'progress');
 assert.equal(parseTab(null),DEFAULT_TAB);
 assert.equal(parseTab('nope'),DEFAULT_TAB);
 assert.equal(parseTab('progress',{defaultTab:'settings'}),'progress','an explicit valid tab beats the pref');
});

test('parseQuery reads a string, a URLSearchParams and a searchParams object',()=>{
 assert.deepEqual(parseQuery('?tab=study&user=gir'),{tab:'study',user:'gir'});
 assert.deepEqual(parseQuery('tab=study&user=gir'),{tab:'study',user:'gir'});
 assert.deepEqual(parseQuery(new URLSearchParams('tab=settings')),{tab:'settings',user:''});
 assert.deepEqual(parseQuery({tab:'progress',user:'gir'}),{tab:'progress',user:''+'gir'});
 // App Router hands a repeated param back as an array; take the first rather than stringifying both.
 assert.deepEqual(parseQuery({tab:['study','settings'],user:['gir']}),{tab:'study',user:'gir'});
 // Nothing usable in, still a complete answer out.
 for(const empty of ['','?',undefined,null,{},new URLSearchParams(),[],42])
  assert.deepEqual(parseQuery(empty),{tab:DEFAULT_TAB,user:''},'parseQuery('+JSON.stringify(empty)+')');
 assert.deepEqual(parseQuery('',{defaultTab:'study'}),{tab:'study',user:''});
 // ?user= is normalized the way the board already normalizes a username, and dropped when it cannot
 // be one: a mangled link shows the default profile instead of an error.
 assert.equal(parseQuery('?user=GIR').user,'gir');
 assert.equal(parseQuery('?user=%20gir%20').user,'gir');
 for(const bad of ['?user=','?user=a','?user=has%20space','?user=no-dashes','?user='+'x'.repeat(25),'?user=%E2%98%85'])
  assert.equal(parseQuery(bad).user,'',bad+' must not survive as a selection');
 assert.equal(parseQuery('?tab=settings&tab=today').tab,'settings','the first value wins, as URLSearchParams.get does');
 assert.equal(parseQuery('?other=1').tab,DEFAULT_TAB);
});

test('serializeQuery omits the seeded tab and round-trips',()=>{
 assert.equal(serializeQuery({tab:'study',user:'gir'}),'?tab=study&user=gir');
 assert.equal(serializeQuery({tab:'study'}),'?tab=study');
 assert.equal(serializeQuery({user:'gir'}),'?user=gir');
 // The common link stays clean, and that is also what makes the round trip hold.
 assert.equal(serializeQuery({tab:DEFAULT_TAB}),'');
 assert.equal(serializeQuery({}),'');
 assert.equal(serializeQuery(),'');
 assert.equal(serializeQuery({tab:'study'},{defaultTab:'study'}),'','the owner’s own landing tab needs no param');
 assert.equal(serializeQuery({tab:'today'},{defaultTab:'study'}),'?tab=today');
 // Junk in, a usable link out: never 'undefined' or '[object Object]' in a URL.
 for(const junk of [{tab:'nope',user:'!!'},{tab:null,user:null},{tab:['study']},{tab:{},user:{}}])
  assert.doesNotMatch(serializeQuery(junk),/undefined|null|object|%5B/,'serializeQuery('+JSON.stringify(junk)+')');
 assert.equal(serializeQuery({tab:'nope',user:'!!'}),'');
 for(const prefs of [undefined,DEFAULTS,{defaultTab:'study'},{defaultTab:'settings'},{defaultTab:'nope'}])
  for(const tab of TABS)
   for(const user of ['','gir','brother'])
    assert.deepEqual(parseQuery(serializeQuery({tab,user},prefs),prefs),{tab,user},'round trip failed for '+tab+'/'+user+' with '+JSON.stringify(prefs));
 // Parse is a fixed point: feeding a serialized query back through changes nothing.
 const once=parseQuery('?tab=study&user=GIR');
 assert.deepEqual(parseQuery(serializeQuery(once)),once);
});

test('tabHref is always a usable href, and always ROOT-relative',()=>{
 assert.equal(tabHref('study','gir'),'/?tab=study&user=gir');
 assert.equal(tabHref(DEFAULT_TAB,''),'/','a bare board link must be the root, not an empty href');
 assert.equal(tabHref('nope','!!'),'/');
 assert.equal(tabHref('study','',{defaultTab:'study'}),'/');
 for(const tab of TABS)assert.ok(tabHref(tab,'gir').length>1);
 // THE BUG THIS PINS: a bare '?tab=progress' is relative to the CURRENT path, so the board tabs in
 // Settings' own bottom nav resolved to /settings/display?tab=progress and two of the four slots
 // were a dead end with no board at all. Every href this prints has to start at the root.
 for(const prefs of [undefined,DEFAULTS,{defaultTab:'study'},{defaultTab:'settings'},{defaultTab:'nope'}])
  for(const tab of [...TABS,'nope','',null,undefined])
   for(const user of ['','gir','!!'])
    assert.match(tabHref(tab,user,prefs),/^\/($|\?)/,'tabHref('+tab+','+user+','+JSON.stringify(prefs)+') is not root-relative');
 // And it still parses back to the tab it names, from any path, because the query is unchanged.
 assert.deepEqual(parseQuery(new URL(tabHref('progress','gir'),'http://x/settings/display').search),{tab:'progress',user:'gir'});
});

test('lib/tabs.js stays pure: no DOM, no router, no cycle back into prefs',async()=>{
 const file=await import('node:fs').then(fs=>fs.readFileSync(new URL('../lib/tabs.js',import.meta.url),'utf8'));
 // Comments explain what this module deliberately does NOT touch, so match on the code alone.
 const source=file.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
 assert.doesNotMatch(source,/\bdocument\b|\bwindow\b|localStorage|next\/navigation|useRouter/,'lib/tabs.js must stay importable from a server component and a DOM-less test');
 assert.doesNotMatch(source,/from\s*'\.\/prefs\.js'/,'prefs imports tabs; the reverse would be a cycle. The pref value is passed in instead.');
});

// ---------------------------------------------------------------------------------------------
// SC 3.2.4 (Consistent Identification). There are TWO fixed bottom bars at the same screen
// position -- the board's and Settings' -- and they used to carry different labels ("Study" vs
// "Journal" for one destination), a different slot order and icons on only one of them. One SLOTS
// table in components/tabs/slugs.js is the fix, so these read the components rather than trusting it.
// ---------------------------------------------------------------------------------------------
const source=name=>readFileSync(new URL('../components/'+name,import.meta.url),'utf8');
test('both fixed bottom navs read one slot table, so one destination has one name',()=>{
 assert.deepEqual(SLOTS.map(s=>s[0]),['today','study','progress','settings'],'the slot ORDER is shared, not restated');
 assert.deepEqual(SLOTS.map(s=>s[1]),['Today','Journal','Progress','Settings']);
 for(const [slug,label,icon] of SLOTS){
  assert.equal(isTab(slug),true,slug+' is not a lib/tabs.js slug');
  assert.match(label,/^[A-Z][a-z]+$/,'a slot label is one plain word: '+label);
  assert.match(icon,/^[a-z]+$/,'a slot icon is a sprite id: '+icon);
 }
 // The owner asked for "Journal", and `study` is what travels in the URL. Neither nav may say Study.
 assert.equal(SLOTS.find(s=>s[0]==='study')[1],'Journal');
 for(const file of ['board-tabs.jsx','settings/bottom-nav.jsx','settings/display-panel.jsx']){
  const text=source(file);
  assert.match(text,/import \{SLOTS\} from '(\.|\.\.)\/tabs\/slugs\.js'/,file+' restates the slot table');
  assert.ok(!/>Study</.test(text)&&!/'Study'/.test(text)&&!/:'Study'/.test(text),file+' still labels the Journal "Study"');
 }
 // Every sprite id a slot names has to exist, or a nav renders an empty box.
 const sprite=source('icons.jsx');
 for(const [,,icon] of SLOTS)assert.ok(sprite.includes('id="icon-'+icon+'"'),'components/icons.jsx has no #icon-'+icon);
 // Both navs draw the glyph, and both spell the current slot the same way: aria-current=page, which
 // is what `page` is for on a real href, and what the two settings navs already used.
 for(const file of ['board-tabs.jsx','settings/bottom-nav.jsx']){
  const text=source(file);
  assert.match(text,/<use href=\{"#icon-"\+icon\}\/>/,file+' draws no icon');
  assert.match(text,/aria-current=\{[^}]*['"]page['"]/,file+' does not mark the current slot aria-current=page');
  assert.ok(!/aria-current=\{[^}]*['"]true['"]/.test(text),file+' still uses aria-current="true"');
 }
 assert.match(source('settings/bottom-nav.jsx'),/aria-label="Board sections"/,'the nav is named for its purpose, not the product');
 assert.match(source('board-tabs.jsx'),/aria-label="Board sections"/);
});

// ---------------------------------------------------------------------------------------------
// A DISPLAY CONTROL THAT CHANGES NOTHING IS WORSE THAN A MISSING ONE. Four of them shipped wired to
// localStorage and to no consumer at all. These pin the consumer for each, because the panel itself
// will keep saving them whether or not anything reads them.
// ---------------------------------------------------------------------------------------------
test('every display preference reaches a consumer',()=>{
 // Comments in here quote the shape they replaced, so match on the code alone.
 const dash=source('dashboard.jsx').replace(/^\s*\/\/.*$/gm,'');
 // defaultTab: boardTab's fallback is the SEED, so a visit with no ?tab=, with ?tab= empty, or with a
 // ?tab= the board has no panel for all land on the owner's tab. `has('tab')` only covered the first.
 assert.match(dash,/setTab\(boardTab\(new URLSearchParams\(location\.search\)\.get\('tab'\),seedTab\(saved\)\)\)/,'defaultTab must seed the tab');
 assert.ok(!/has\('tab'\)/.test(dash),'the old guard honored defaultTab only when there was no ?tab= at all');
 assert.match(dash,/boardTab\(params\.get\('tab'\),back\.tab\)/,'and the back gesture seeds it too');
 // clock and compactFeed reach the one list both tabs print; chartMeasure reaches the week chart.
 assert.match(dash,/<TodayPanel[^>]*clockPref=\{prefs\.clock\} compactFeed=\{prefs\.compactFeed\}/);
 assert.match(dash,/<JournalPanel[^>]*clockPref=\{prefs\.clock\} compactFeed=\{prefs\.compactFeed\}/);
 assert.match(dash,/<ProgressPanel[^>]*measure=\{prefs\.chartMeasure\}/);
 assert.match(source('feed.jsx'),/posts=feedPosts\(posts,compactFeed\)/,'compactFeed filters the shared list');
 assert.match(source('feed.jsx'),/clock\(post\.created_at,timeZone,true,clockPref\)/,'a post time takes the hour cycle');
 assert.match(source('study.jsx'),/clock\(start,timeZone,false,clockPref\)/,'and so does the hourly summary label');
 assert.match(source('study.jsx'),/useState\(measure\)/,'the chart measure is seeded, not reset to minutes');
 assert.match(source('week-widget.jsx'),/measure=\{measure\}/);
 // Every key in DEFAULTS is either stamped on <html> for CSS or named here with its consumer.
 const consumed=['clock','compactFeed','defaultTab','chartMeasure'];
 for(const key of Object.keys(DEFAULTS))
  assert.ok(STAMPED.includes(key)||consumed.includes(key),key+' is saved by the Display panel and read by nobody');
});

// ---------------------------------------------------------------------------------------------
// Two behaviors that belong to the tabs even though they live in other files: the scroll thumb that
// a tab change invalidates, and the auto-focus that used to take the tab bar off a phone's screen.
// ---------------------------------------------------------------------------------------------
test('the scroll thumb is repositioned when the DOCUMENT changes length, not only on scroll',()=>{
 const hook=readFileSync(new URL('../components/hooks/use-scroll-indicator.js',import.meta.url),'utf8');
 // A tab swap moves scrollHeight by an order of magnitude with no scroll and no resize, so the thumb
 // kept the previous tab's size and stayed visible on a tab with nothing to scroll.
 assert.match(hook,/new ResizeObserver\(position\)/,'nothing watches the document growing or shrinking');
 assert.match(hook,/observe\(document\.body\)/,'html is the scroll container; its own box does not grow with its content');
 assert.match(hook,/grew\?\.disconnect\(\)/,'the observer has to be torn down with the listeners');
 // Still guarded, because a ResizeObserver-less environment must not take the board down.
 assert.match(hook,/typeof ResizeObserver==='function'/);
});
test('signing in on a phone never costs the reader their navigation',()=>{
 const dash=readFileSync(new URL('../components/dashboard.jsx',import.meta.url),'utf8');
 const feed=readFileSync(new URL('../components/feed.jsx',import.meta.url),'utf8');
 // Focusing the composer raises the keyboard, which fires the deliberate hide rule in
 // 33-board-tabs.css -- and .header-settings is already gone below 760px, so a phone was left with
 // no way to Settings or another tab at the exact moment it had just signed in.
 assert.match(dash,/matchMedia\('\(max-width:760px\)'\)\.matches\)composer\.revealMessage\(\);else composer\.focusMessage\(\)/,'the auto-focus is not conditioned on the narrow layout');
 assert.match(dash,/onEntered=\{entered\}/);
 assert.match(feed,/revealMessage:\(\)=>[^,}]*scrollIntoView/,'a narrow screen gets the composer in view without a keyboard');
 // The hide rule itself stays: a real keyboard really does float the fixed bar over the submit button.
 const sheet=readFileSync(new URL('../app/styles/33-board-tabs.css',import.meta.url),'utf8');
 assert.match(sheet,/html:has\(\.composer textarea:focus\) \.board-tabs\{display:none\}/);
});
