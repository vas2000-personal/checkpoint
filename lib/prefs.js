// Device-local display preferences: ONE definition of the shape, the defaults and the validation.
// Before this file the blocking boot script in app/layout.jsx and the settings UI each carried their
// own copy of the key list and the scale whitelist, and they drifted. The boot script still cannot
// import — it is an inline string — so tests/prefs.test.js runs that string and asserts it produces
// exactly attrs(normalize(x)) for every stored shape, which is the only guard against drifting again.
import {DEFAULT_TAB,isTab} from './tabs.js';
export const STORAGE_KEY='checkpoint-display';
export const SCALES=['small','normal','large'];
// A CURATED set, not a free hue or a color wheel. The stylesheet hard-codes forest green in many
// rules and tests/appearance.test.js pins muted-text and accent contrast in four themes (light, dark,
// high contrast, dark+high contrast). An arbitrary user hue cannot be contrast-checked at build time,
// so it would quietly break the guarantee the suite exists to hold; a short list can be verified once
// per theme and stays verified. Each slug is a palette defined in the stylesheet, nothing more.
export const ACCENTS=['forest','ocean','plum','clay','ink'];
// Tri-state on purpose. A boolean defaulting to false would have to mean "full motion", overriding a
// visitor whose OS already asks for reduced motion; 'system' defers to prefers-reduced-motion, 'on'
// reduces regardless, 'off' is the explicit opt back INTO motion that a boolean cannot express.
export const MOTION=['system','on','off'];
// '12'|'24', strings, because they are slugs for lib/study.js clock() and a data attribute, not maths.
export const CLOCKS=['12','24'];
// StudyWeek's own useState resets this on every visit; persisting it is the whole fix.
export const MEASURES=['minutes','questions'];
export const DEFAULTS={
 dark:false,contrast:false,focus:false,scale:'normal',
 accent:'forest',          // the shipped forest green, so an upgrade changes nothing visually
 reduceMotion:'system',     // defer to the OS until the owner says otherwise
 compactFeed:false,         // hide the hourly summary cards (post.bucket_start != null), keep the written posts
 clock:'12',                // the family reads a.m./p.m.; lib/study.js clock() is the only formatter
 defaultTab:DEFAULT_TAB,    // which board tab a visit opens on; slugs live in lib/tabs.js
 chartMeasure:'minutes',
};
export const STAMPED=['dark','contrast','focus','scale','accent','reduceMotion'];
const pick=(list,value,fallback)=>list.includes(value)?value:fallback;
// Strict ===true: everything we write is a real boolean, and a hostile '{"dark":"yes"}' should read as
// off rather than as on. The boot script does the same comparison, byte for byte.
const bool=value=>value===true;
// A boolean reduceMotion is the one older shape in the wild (an early build stored true/false before
// the third state existed); true meant "reduce", so it maps to 'on'.
const motion=value=>typeof value==='boolean'?(value?'on':'off'):value;
function parse(text){try{return JSON.parse(text)}catch{return null}}
// Takes whatever localStorage held: null, '', a literal 'null' (JSON.parse returns null and the old
// script threw on s[k], silently losing EVERY setting), 'not json', '[]', '0', or an object with junk
// in it. Always returns a complete, known-good object, so callers never guard a field again.
export function normalize(raw){
 const parsed=typeof raw==='string'?parse(raw):raw;
 const s=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
 return {
  dark:bool(s.dark),contrast:bool(s.contrast),focus:bool(s.focus),
  scale:pick(SCALES,s.scale,DEFAULTS.scale),
  accent:pick(ACCENTS,s.accent,DEFAULTS.accent),
  reduceMotion:pick(MOTION,motion(s.reduceMotion),DEFAULTS.reduceMotion),
  compactFeed:bool(s.compactFeed),
  clock:pick(CLOCKS,s.clock,DEFAULTS.clock),
  defaultTab:isTab(s.defaultTab)?s.defaultTab:DEFAULTS.defaultTab,
  chartMeasure:pick(MEASURES,s.chartMeasure,DEFAULTS.chartMeasure),
 };
}
export const serialize=prefs=>JSON.stringify(normalize(prefs));
// The dataset patch, keyed exactly as element.dataset wants it: data-dark, data-contrast, data-focus,
// data-scale, data-accent, data-reduce-motion. Only the preferences a stylesheet reads are stamped —
// a flash of the wrong theme, size, accent or animation is what the blocking script exists to prevent.
// clock, compactFeed, defaultTab and chartMeasure change no CSS, so they stay out of the attributes.
export const attrs=prefs=>{const p=normalize(prefs);return {dark:String(p.dark),contrast:String(p.contrast),focus:String(p.focus),scale:p.scale,accent:p.accent,reduceMotion:p.reduceMotion}};
// storage is passed in, never read off window: these run in the settings UI, and in tests with a stub.
export function read(storage){try{return normalize(storage?.getItem(STORAGE_KEY))}catch{return normalize(null)}}
export function write(storage,prefs){const value=normalize(prefs);try{storage?.setItem(STORAGE_KEY,JSON.stringify(value))}catch{}return value}

// --- orphaned widget state ------------------------------------------------------------------------
// "Remember expanded widgets" keys localStorage by widget TITLE (components/widget.jsx), so the keys
// of the cards this phase folds into Settings are left behind forever with no UI to clear them.
// This runs from the Display panel, which is the one page with no session and no fetch, rather than
// on the board: it is a one-time tidy, not something worth a localStorage write on every page view.
export const WIDGET_PREFIX='checkpoint-widget:';
// Only these exact keys are removed. RETIRED must stay a hand-written list, never a prefix sweep: a
// sweep would also wipe the open/closed state of every card that SURVIVES, which is the one failure
// mode this helper could cause. LIVE is here so a test can prove they are disjoint and untouched.
// 'sign-in' and 'profile-settings' are the two cards that moved to /settings/account and
// /settings/day; 'Your progress', 'Adventure' and 'This week' are the three the Progress TAB
// unwrapped, since a tab is its own disclosure and those cards no longer sit inside a <details>.
// All five are verified against the rendered set by tests/prefs.test.js, which reads the components.
export const RETIRED_WIDGETS=['sign-in','profile-settings','Your progress','Adventure','This week'];
export const LIVE_WIDGETS=['A little further, every day','For the family','study-metrics'];
// Bump the version if a later phase retires more cards; the flag is what keeps this from running on
// every page load, so a list fixed without a bump would never get its chance. 6 because version 5
// shipped with only the first two names on the retired list.
export const CLEANUP_KEY='checkpoint-cleanup',CLEANUP_VERSION='6';
export function cleanupWidgetKeys(storage,retired=RETIRED_WIDGETS){
 const removed=[];
 try{
  if(storage?.getItem(CLEANUP_KEY)===CLEANUP_VERSION)return removed;
  for(const name of retired){const key=WIDGET_PREFIX+name;if(storage?.getItem(key)!==null&&storage?.getItem(key)!==undefined){storage.removeItem(key);removed.push(key)}}
  storage?.setItem(CLEANUP_KEY,CLEANUP_VERSION);
 }catch{}
 return removed;
}
