"use client";
import ErrorBoundary from '../error-boundary.jsx';
import {PostList} from '../feed.jsx';
import {Icon} from '../icons.jsx';
// The only tab that pages, which is why the cursor in use-board.js stays scoped to it: Today reads the
// same first page and Progress reads none of it. The All-updates/Today filter is gone — the Today tab
// IS that filter, and two ways to say the same thing was the thing worth removing.
export default function JournalPanel({hidden,board,today,timeZone,loading,loadError,load,compactFeed,clockPref}){
 const posts=(board?.posts||[]).slice().sort((a,b)=>b.post_day.localeCompare(a.post_day)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 return <section className="tab-panel" id="panel-journal" aria-label="Journal" hidden={hidden}><div className="feed-column">
  <div className="feed-heading"><div><div className="eyebrow">ONE UPDATE AT A TIME</div><h2 id="feed-title">The latest chapters<span>.</span></h2></div></div>
  <section className="feed" aria-label="Daily updates">
   <div id="posts"><ErrorBoundary fallback={<div className="empty">The chapters could not be shown right now. Reload the page to try again.</div>}><PostList posts={posts} board={board} today={today} timeZone={timeZone} placeholder={!loadError} compactFeed={compactFeed} clockPref={clockPref} empty="The first chapter starts here. Updates will appear as they are posted."/></ErrorBoundary></div>
   <button id="more" className="load-more" hidden={!board?.next} disabled={loading} onClick={() => load(true,true)}>Earlier chapters <Icon name="down" /></button>
  </section>
  <div className="feed-note"><svg><use href="#icon-star"/></svg> Progress over perfection. Always.</div>
 </div></section>;
}
