"use client";
import {useEffect,useRef,useState} from 'react';
import {IconLibrary} from './icons.jsx';
import RememberedDetails from './remembered-details.jsx';
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
import EntryDialog,{heldRecoveryCode} from './entry-dialog.jsx';
import {api} from '../lib/client.js';
const EMPTY_STATS = {xp:0,streak:0,level:1,days:[],postedToday:false};
// Until phase 5 builds Settings, this is the ONLY route from the signed-in board to /api/passphrase:
// without it a user who tapped "Not now" could never enroll, change or remove one. It asks the server
// rather than the board payload, because an enrolled flag has no business in a public payload.
// `nonce` is what the dialog bumps after a successful change, so the summary line cannot go stale.
function SignInCard({username,nonce,onOpen}){
 const [state,setState]=useState(null),[error,setError]=useState('');
 const [open,setOpen]=useState(false),card=useRef(null);
 // LAZY on purpose. GET /api/passphrase is a checkpoint_credentials read, and firing it on mount put
 // that read on the critical path of every signed-in page view — exactly what keeping the enrolled
 // flag out of the public board payload was meant to avoid. This widget is collapsed by default, so an
 // ordinary load asks the database for nothing; the native toggle event is the trigger, which also
 // covers the remembered-open case RememberedDetails restores before this effect runs.
 useEffect(()=>{const box=card.current?.closest('details');if(!box)return;const sync=()=>setOpen(box.open);sync();box.addEventListener('toggle',sync);return()=>box.removeEventListener('toggle',sync)},[]);
 useEffect(()=>{if(!open)return;let live=true;setError('');api('/api/passphrase').then(result=>{if(live)setState(result)}).catch(problem=>{if(live)setError(problem.message)});return()=>{live=false}},[open,username,nonce]);
 const on=state?.protected===true;
 // The summary already names this widget, so the card inside states what it is ABOUT rather than
 // reprinting that same label directly underneath it.
 return <RememberedDetails storageKey="sign-in" className="compact-widget"><summary><span><strong>Your sign-in</strong><small>{error?'Could not be checked':state?on?'Passphrase on':'Username only':open?'Checking…':'Passphrase and recovery code'}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div className="widget-content"><section className="card profile-settings" ref={card}><span className="eyebrow">KEEP THIS USERNAME YOURS</span><h3>Who can sign in as you.</h3><p>{on?<>A new device needs your passphrase as well as @{username}. Devices you already use stay signed in.</>:<>Anyone who knows @{username} can sign in as you. A passphrase changes that, and devices you already use stay signed in.</>}</p><div className="sign-in-actions"><button type="button" className="settings-save" disabled={!state} onClick={()=>onOpen(on)}>{on?'Change or remove':'Add a passphrase'}</button><small>{on?'Changing or removing it needs that passphrase, or the recovery code you saved.':'You will get a recovery code to save. It is shown once.'}</small></div><p role="alert">{error}</p></section></div></RememberedDetails>
}
// initialBoard is the server-rendered board: the family sees real content in the first HTML instead of
// an empty shell, and the mount fetch is skipped because that payload is already this fresh.
export default function Dashboard({initialBoard=null}) {
  const modalRef=useRef(null),feedRef=useRef(null),entryRef=useRef(null);
  const scrolled=useScrollIndicator();
  const {toast,notify}=useToast();
  const [signInNonce,setSignInNonce]=useState(0);
  const {board,user,setUser,selected,setSelected,loading,loadError,load,selectedUser}=useBoard(initialBoard,modalRef);
  // A recovery code that was minted in THIS tab and never acknowledged is put back on screen, because
  // a reload or an Escape must not be the last anyone ever sees of it. It is sessionStorage, written
  // only by an enrollment in this tab, so an ordinary visitor — a parent on the public board, or the
  // owner's already-paired device — has nothing stashed and is still asked for nothing.
  useEffect(()=>{if(user&&heldRecoveryCode(user))entryRef.current?.open('change',user)},[user]);
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
    {user&&board?.selectedUsername===user&&<><ProfileSettings timeZone={timeZone} today={today} activeBreak={board.activeBreak} onSave={saveSettings}/><SignInCard username={user} nonce={signInNonce} onOpen={on=>entryRef.current?.open(on?'change':'enroll',user)}/></>}
    <HomeScreenTip/>
    <Widget title="For the family" summary="A little window into the day"><section className="family-note"><span className="family-icon"><svg><use href="#icon-heart"/></svg></span><div><h3>A little window into my day.</h3><p>Just open this page to follow along.<br />I’m glad you’re here.</p></div></section></Widget>
  </aside></div>
  <footer><a className="footer-brand" href="/">checkpoint.</a><p>A little progress, every day.</p><span>Days reset at 4 a.m. · {timeZone.replaceAll('_',' ')}</span></footer>
</main>
<EntryDialog ref={entryRef} modalRef={modalRef} setUser={setUser} selectedUser={selectedUser} load={load} onEntered={()=>feedRef.current?.focusMessage()} onPassphrase={message=>{setSignInNonce(count=>count+1);if(message)notify(message)}}/>
<div id="toast" role="status" className={toast ? "show" : ""}>{toast}</div></>;
}
