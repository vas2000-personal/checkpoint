// The board's query string, parsed and printed in one place. No DOM, no router: the server component
// reads Next's searchParams object, the client reads location.search, and both must land on the same
// tab or the first client render disagrees with the HTML.
import {validateUsername} from './validate.js';
export const TABS=['today','progress','study','settings'];
export const DEFAULT_TAB='today';
export const isTab=value=>typeof value==='string'&&TABS.includes(value);
// A visit with no usable ?tab= opens on the owner's saved defaultTab; a junk pref falls back here, so
// an unreadable localStorage can never leave the board with no tab selected.
export const seedTab=prefs=>isTab(prefs?.defaultTab)?prefs.defaultTab:DEFAULT_TAB;
// Unknown values fall back to the SEED rather than to DEFAULT_TAB: ?tab=setting (a typo, an old link,
// a renamed slug) is still a visit, and the whole point of the pref is where a visit lands.
export function parseTab(value,prefs){const tab=typeof value==='string'?value.trim().toLowerCase():'';return isTab(tab)?tab:seedTab(prefs)}
// Accepts whatever the caller has: '?tab=study&user=gir', 'tab=study', URLSearchParams, or the plain
// object App Router hands a server component (where a repeated param arrives as an array).
function params(query){
 if(query instanceof URLSearchParams)return query;
 if(typeof query==='string')return new URLSearchParams(query.startsWith('?')?query.slice(1):query);
 const out=new URLSearchParams();
 if(query&&typeof query==='object')for(const [k,v] of Object.entries(query)){const one=Array.isArray(v)?v[0]:v;if(typeof one==='string')out.set(k,one)}
 return out;
}
// An invalid ?user= is dropped, not an error: the board already treats an empty selection as "the
// default profile", which is exactly what a parent following a mangled link should see.
const parseUser=value=>{try{return validateUsername(value)}catch{return ''}};
export function parseQuery(query,prefs){const q=params(query);return {tab:parseTab(q.get('tab'),prefs),user:parseUser(q.get('user'))}}
// The seeded tab is omitted so the common link stays '/' and so parse(serialize(x)) is x: an omitted
// tab re-parses to the same seed. Order is fixed (tab, then user) to keep links stable and cacheable.
export function serializeQuery({tab,user}={},prefs){
 const q=new URLSearchParams(),clean=parseTab(tab,prefs),who=parseUser(user);
 if(clean!==seedTab(prefs))q.set('tab',clean);
 if(who)q.set('user',who);
 return q.size?'?'+q:'';
}
// ROOT-RELATIVE, never a bare '?tab=': an href of '?tab=progress' resolves against the CURRENT path,
// so from /settings/display it became /settings/display?tab=progress and the board tab in Settings'
// own bottom nav was a dead end. Every caller wants the board, which is '/', so print it.
export const tabHref=(tab,user,prefs)=>'/'+serializeQuery({tab,user},prefs);
