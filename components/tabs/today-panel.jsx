"use client";
import ErrorBoundary from '../error-boundary.jsx';
import Widget from '../widget.jsx';
import Hero from '../hero.jsx';
import {Composer,PostList} from '../feed.jsx';
import {StudyStatus,HomeScreenTip} from '../study.jsx';
// The tab the family lands on: where the day stands, what was written today, and the line that is
// addressed to them. The hero and the family note keep their disclosures because they are secondary to
// that; the status bar, the composer and today's posts are the content and are no longer nested in one.
// The pace card and the passphrase card used to be composed in here from dashboard.jsx; they are
// /settings/day and /settings/account now, so this panel takes no children at all.
export default function TodayPanel({hidden,board,user,today,timeZone,stats,loading,loadError,composerRef,load,notify,compactFeed,clockPref}){
 const posts=(board?.posts||[]).filter(post=>post.post_day===today).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 return <section className="tab-panel" id="panel-today" aria-label="Today" hidden={hidden}>
  <ErrorBoundary fallback={<div className="empty">The study status is taking a break. Everything else is still here.</div>}><StudyStatus daily={board?.dailyStudy} awake={!!board?.awake} connected={board?.connected!==false} onBreak={!!board?.activeBreak} displayName={board?.displayName} timeZone={timeZone} today={today} loading={!board}/></ErrorBoundary>
  {board?.activeBreak&&<div className="break-banner"><span aria-hidden="true">☕</span><div><strong>On a break till {new Date(board.activeBreak.until_day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</strong><span>Rest counts too. Your streak is protected through this day.</span></div></div>}
  <div className="today-stack">
   <Composer ref={composerRef} board={board} user={user} stats={stats} load={load} notify={notify}/>
   <h2 className="sr-only">Today’s updates</h2>
   <ErrorBoundary fallback={<div className="empty">Today’s updates could not be shown right now. Reload the page to try again.</div>}><PostList posts={posts} board={board} today={today} timeZone={timeZone} placeholder={!loadError} compactFeed={compactFeed} clockPref={clockPref} empty="No update today yet. A fresh checkpoint is waiting."/></ErrorBoundary>
  </div>
  <div className="hero-widget"><Widget title="A little further, every day" summary={stats.postedToday?"Today’s checkpoint is saved":"One day at a time · meet Miss Log and Pip"}><Hero board={board} stats={stats} today={today}/></Widget></div>
  <HomeScreenTip/>
  <Widget title="For the family" summary="A little window into the day"><section className="family-note"><span className="family-icon"><svg><use href="#icon-heart"/></svg></span><div><h3>{board?.familyNote||'A little window into my day.'}</h3><p>Just open this page to follow along.<br />I’m glad you’re here.</p></div></section></Widget>
 </section>;
}
