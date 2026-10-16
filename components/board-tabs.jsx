"use client";
import {tabHref} from '../lib/tabs.js';
// The slug set, the Journal alias and the SLOTS table (label, order and glyph) live in ./tabs/slugs.js,
// which app/page.jsx and components/settings/bottom-nav.jsx import too: the two fixed bottom bars sit
// at the same screen position, so one name per destination is the whole point of sharing it.
import {SLOTS} from './tabs/slugs.js';
// A board tab is LOCAL state, not a route: a route change would remount the board, refetch /api/board
// and flicker the Awake pill on every tap. The href is still real, so a tab can be copied, bookmarked
// or opened in a new tab; only a plain left click is intercepted. One component, two shapes — a strip
// under the header from 760px up, a fixed bottom nav below it (see app/styles/33-board-tabs.css).
export default function BoardTabs({tab,user,prefs,onTab,onBeforeTab}){
 const plain=event=>!(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0);
 return <nav className="board-tabs" aria-label="Board sections" onPointerDownCapture={onBeforeTab} onKeyDownCapture={onBeforeTab}><div className="board-tabs-inner">
  {SLOTS.map(([slug,label,icon])=>slug==='settings'
   ?<a key={slug} className="board-tab is-route" href="/settings"><svg viewBox="0 0 24 24" aria-hidden="true"><use href={"#icon-"+icon}/></svg><span>{label}</span></a>
   // aria-current=page, not "true": these are real hrefs, which is what `page` is for, and it is what
   // both settings navs already use — one spelling for one state across the three navs.
   :<a key={slug} className={"board-tab"+(tab===slug?" is-current":"")} href={tabHref(slug,user,prefs)} aria-current={tab===slug?"page":undefined} onClick={event=>{if(!plain(event))return;event.preventDefault();onTab(slug)}}><svg viewBox="0 0 24 24" aria-hidden="true"><use href={"#icon-"+icon}/></svg><span>{label}</span></a>)}
 </div></nav>;
}
