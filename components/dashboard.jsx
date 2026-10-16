"use client";
import {useRef} from 'react';
import {IconLibrary} from './icons.jsx';
import {StudyStatus,ProfileSettings,HomeScreenTip} from './study.jsx';
import useBoard from './hooks/use-board.js';
import useToast from './hooks/use-toast.js';
import useScrollIndicator from './hooks/use-scroll-indicator.js';
import ErrorBoundary from './error-boundary.jsx';
import Widget from './widget.jsx';
import SiteHeader from './site-header.jsx';
import Hero from './hero.jsx';
import Scoreboard from './scoreboard.jsx';
import Feed from './feed.jsx';
import Adventure from './adventure.jsx';
import WeekWidget from './week-widget.jsx';
import EntryDialog from './entry-dialog.jsx';
import {api} from '../lib/client.js';
const EMPTY_STATS = {xp:0,streak:0,level:1,days:[],postedToday:false};
// initialBoard is the server-rendered board: the family sees real content in the first HTML instead of
// an empty shell, and the mount fetch is skipped because that payload is already this fresh.
export default function Dashboard({initialBoard=null}) {
  const modalRef=useRef(null),feedRef=useRef(null),entryRef=useRef(null);
  const scrolled=useScrollIndicator();
  const {toast,notify}=useToast();
  const {board,user,setUser,selected,setSelected,loading,loadError,load,selectedUser}=useBoard(initialBoard,modalRef);
  function openAuth(mode){entryRef.current?.open(mode)}
  async function enterOrLeave(){if(user){try{await api('/api/signout',{});setUser('');feedRef.current?.clearMessage();selectedUser.current='';await load(false,true)}catch(error){notify(error.message)}}else openAuth('signin')}
  const timeZone=board?.timeZone||'America/New_York';
  async function saveSettings(body){await api('/api/settings',body);notify(body.time_zone?'Time zone saved.':'Your pace is saved.');await load(false,true)}
  const stats=board?.stats||EMPTY_STATS,today=board?.today;
  return <><IconLibrary /><span className="scroll-indicator" aria-hidden="true"/>
<SiteHeader scrolled={scrolled} user={user} onAuth={openAuth} onEnterOrLeave={enterOrLeave}/>
<main aria-busy={!board}>
  {/* The visible h1 sits in a widget that is collapsed by default and removed in focus mode, so the
      page keeps a stable heading here and the hero copy drops out of the outline. */}
  <h1 className="sr-only">A little further, every day.</h1>
  <ErrorBoundary fallback={<div className="empty">The study status is taking a break. Everything else is still here.</div>}><StudyStatus daily={board?.dailyStudy} awake={!!board?.awake} connected={board?.connected!==false} onBreak={!!board?.activeBreak} displayName={board?.displayName} timeZone={timeZone} today={today} loading={!board}/></ErrorBoundary>
  <Widget title="A little further, every day" summary={stats.postedToday?"Today’s checkpoint is saved":"One day at a time · meet Miss Log and Pip"}><Hero board={board} stats={stats} today={today}/></Widget>
  {board?.activeBreak&&<div className="break-banner"><span aria-hidden="true">☕</span><div><strong>On a break till {new Date(board.activeBreak.until_day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</strong><span>Rest counts too. Your streak is protected through this day.</span></div></div>}
  <Widget title="Your progress" summary={board?`${stats.xp} XP · ${stats.streak} day streak · level ${stats.level}`:"Loading your progress…"}><Scoreboard board={board} stats={stats}/></Widget>
  <div className="layout"><div className="feed-column"><ErrorBoundary fallback={<div className="empty">The chapters could not be shown right now. Reload the page to try again.</div>}><Feed ref={feedRef} board={board} user={user} today={today} timeZone={timeZone} stats={stats} loading={loading} loadError={loadError} load={load} selected={selected} setSelected={setSelected} selectedUser={selectedUser} notify={notify}/></ErrorBoundary>
  </div>
  <aside>
    <Widget title="Adventure" summary={board?`Level ${stats.level} · ${stats.xp%300} / 300 XP toward the next level`:"Loading the adventure…"}><ErrorBoundary fallback={<div className="empty">The trail could not be drawn right now.</div>}><Adventure board={board} stats={stats}/></ErrorBoundary></Widget>
    <Widget title="This week" summary={board?`${board.weekly?.minutes||0} min · ${board.weekly?.questions||0} questions`:"Loading this week…"}><ErrorBoundary fallback={<div className="empty">This week could not be shown right now.</div>}><WeekWidget board={board} stats={stats} today={today}/></ErrorBoundary></Widget>
    {user&&board?.selectedUsername===user&&<ProfileSettings timeZone={timeZone} today={today} activeBreak={board.activeBreak} onSave={saveSettings}/>}
    <HomeScreenTip/>
    <Widget title="For the family" summary="A little window into the day"><section className="family-note"><span className="family-icon"><svg><use href="#icon-heart"/></svg></span><div><h3>A little window into my day.</h3><p>Just open this page to follow along.<br />I’m glad you’re here.</p></div></section></Widget>
  </aside></div>
  <footer><a className="footer-brand" href="/">checkpoint.</a><p>A little progress, every day.</p><span>Days reset at 4 a.m. · {timeZone.replaceAll('_',' ')}</span></footer>
</main>
<EntryDialog ref={entryRef} modalRef={modalRef} setUser={setUser} selectedUser={selectedUser} load={load} onEntered={()=>feedRef.current?.focusMessage()}/>
<div id="toast" role="status" className={toast ? "show" : ""}>{toast}</div></>;
}
