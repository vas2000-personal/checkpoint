"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {IconLibrary,Icon} from './icons.jsx';
import useBoard from './hooks/use-board.js';
import useToast from './hooks/use-toast.js';
import useScrollIndicator from './hooks/use-scroll-indicator.js';
import SiteHeader from './site-header.jsx';
import BoardTabs from './board-tabs.jsx';
import {boardTab} from './tabs/slugs.js';
import TodayPanel from './tabs/today-panel.jsx';
import JournalPanel from './tabs/journal-panel.jsx';
import ProgressPanel from './tabs/progress-panel.jsx';
import EntryDialog,{heldRecoveryCode} from './entry-dialog.jsx';
import {api} from '../lib/client.js';
import {DEFAULTS,read} from '../lib/prefs.js';
import {parseQuery,seedTab,tabHref} from '../lib/tabs.js';
const EMPTY_STATS = {xp:0,streak:0,level:1,days:[],postedToday:false};
// initialBoard is the server-rendered board: the family sees real content in the first HTML instead of
// an empty shell, and the mount fetch is skipped because that payload is already this fresh.
// initialTab and initialUser come from app/page.jsx, which read the query string on the SERVER: the
// first HTML already carries the right tab, so there is no paint of Today followed by a jump, and no
// Suspense boundary or client-rendered page the way useSearchParams would have needed.
export default function Dashboard({initialBoard=null,initialTab='today',initialUser=''}) {
  const modalRef=useRef(null),composerRef=useRef(null),entryRef=useRef(null);
  const scrolled=useScrollIndicator();
  const {toast,notify}=useToast();
  const {board,user,setUser,selected,setSelected,loading,loadError,load,selectedUser}=useBoard(initialBoard,modalRef);
  // All three panels stay mounted and only the hidden attribute moves: switching tabs must not remount
  // the board, because the 30s poll plus the focus/pageshow/visibilitychange refresh behind the Awake
  // pill is the reason the tabs are state and not routes.
  const [tab,setTab]=useState(()=>boardTab(initialTab));
  const [prefs,setPrefs]=useState(DEFAULTS),[wanted,setWanted]=useState(initialUser);
  const scrollTop=useRef({}),restored=useRef(false);
  // defaultTab lives in localStorage, which the server cannot read, so a visit with NO ?tab= paints
  // today and this corrects it in a layout effect — before the browser paints the hydrated tree.
  // selectedUser is seeded here too: the server honored ?user=, and the first poll must ask for the
  // same profile instead of falling back to the default one.
  // boardTab's fallback is the SEED rather than 'today', so this corrects three cases in one line: no
  // ?tab= at all, a ?tab= the board has no panel for (?tab=settings, a renamed slug, an empty value),
  // and a valid one, which it returns untouched. The old `has('tab')` guard honored defaultTab only in
  // the first case, so '/?tab=' or an old link landed on Today whatever the owner had chosen.
  useLayoutEffect(()=>{const saved=read(localStorage);setPrefs(saved);selectedUser.current=initialUser;setTab(boardTab(new URLSearchParams(location.search).get('tab'),seedTab(saved)))},[]);
  // A parent reading the Journal who peeks at Today keeps their place in both. The retry is not
  // belt-and-braces: a panel that only becomes visible in THIS commit has not been laid out yet, so
  // the browser clamps the restore to the height of the panel that just left (11,915px of Journal
  // restored against 1,457px of Today lands on 0). One frame later the clamp is the right one.
  useLayoutEffect(()=>{if(!restored.current){restored.current=true;return}const top=scrollTop.current[tab]??0;window.scrollTo(0,top);if(Math.round(window.scrollY)!==Math.round(top))requestAnimationFrame(()=>window.scrollTo(0,top))},[tab]);
  // pushState, not router.push: the tab is already rendered, so a network round trip would buy nothing
  // and cost a flicker. popstate is what makes the phone's back gesture step between tabs.
  // Captured on pointerdown/keydown rather than on the click: activating a tab focuses it, and a
  // browser scrolls a focused control into view, so by the time a click handler runs the position
  // worth remembering has already been scrolled away. Both handlers fire before that happens.
  function rememberScroll(){scrollTop.current[tab]=window.scrollY}
  function openTab(next){if(next===tab)return;setTab(next);history.pushState({tab:next},'',tabHref(next,wanted,prefs))}
  // Only a USER change reloads: it is a different person's feed, so the cursor resets (use-board.js
  // keys that off selectedUser) and the remembered scroll positions no longer mean anything.
  function openUser(next,push=true){setWanted(next);setSelected(next);selectedUser.current=next;scrollTop.current={};load(false,true);if(push)history.pushState({tab,user:next},'',tabHref(tab,next,prefs))}
  useEffect(()=>{const pop=()=>{const params=new URLSearchParams(location.search),back=parseQuery(params,prefs);scrollTop.current[tab]=window.scrollY;setTab(boardTab(params.get('tab'),back.tab));if(back.user!==wanted)openUser(back.user,false)};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[prefs,wanted,tab]);
  // A recovery code that was minted in THIS tab and never acknowledged is put back on screen, because
  // a reload or an Escape must not be the last anyone ever sees of it. It is sessionStorage, written
  // only by an enrollment in this tab, so an ordinary visitor — a parent on the public board, or the
  // owner's already-paired device — has nothing stashed and is still asked for nothing.
  useEffect(()=>{if(user&&heldRecoveryCode(user))entryRef.current?.open('change',user)},[user]);
  // THE LANDING PAGE'S SIGN IN BUTTON. components/landing.jsx is a server component with no dialog of
  // its own, so it links to the board with ?signin — the board opens the REAL dialog on arrival
  // rather than the landing growing a second copy of enrollment, passphrases and recovery codes. The
  // parameter is stripped immediately so a reload, a Back, or a shared copy of the URL is an ordinary
  // board link; a visitor who is already signed in is sent nowhere and shown nothing.
  useEffect(()=>{
   const url=new URL(location.href);
   if(!url.searchParams.has('signin'))return;
   url.searchParams.delete('signin');
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
   if(!user)entryRef.current?.open('signin');
  },[]);
  function openAuth(mode){entryRef.current?.open(mode)}
  // AUTO-FOCUS ONLY WHERE THE KEYBOARD CANNOT TAKE THE NAVIGATION WITH IT. Focusing the composer
  // raises the soft keyboard, which fires the deliberate `html:has(.composer textarea:focus)
  // .board-tabs{display:none}` rule in 33-board-tabs.css — and below 760px .header-settings is
  // already hidden, so the one thing a new arrival had was no way to reach Settings or another tab.
  // The hide rule is right for a real keyboard; starting one unasked is not. On a narrow screen the
  // composer is scrolled into view instead, which is the same invitation without the keyboard.
  function entered(){const composer=composerRef.current;if(!composer)return;if(window.matchMedia('(max-width:760px)').matches)composer.revealMessage();else composer.focusMessage()}
  async function enterOrLeave(){if(user){try{await api('/api/signout',{});setUser('');composerRef.current?.clearMessage();setWanted('');selectedUser.current='';history.replaceState({tab},'',tabHref(tab,'',prefs));await load(false,true)}catch(error){notify(error.message)}}else openAuth('signin')}
  const timeZone=board?.timeZone||'America/New_York';
  const stats=board?.stats||EMPTY_STATS,today=board?.today;
  const profiles=board?.users||[];
  // getBoard falls back to another profile when ?user= names nobody, so a parent who followed a stale
  // or mistyped link is told whose board they are reading instead of being shown the wrong streak.
  const instead=wanted&&board&&!loading&&board.selectedUsername!==wanted?wanted:'';
  return <><IconLibrary /><span className="scroll-indicator" aria-hidden="true"/>
<SiteHeader scrolled={scrolled} user={user} onAuth={openAuth} onEnterOrLeave={enterOrLeave}/>
<BoardTabs tab={tab} user={wanted} prefs={prefs} onTab={openTab} onBeforeTab={rememberScroll}/>
<main aria-busy={!board}>
  {/* The visible h1 sits in the hero, which is collapsed by default and removed in focus mode, so the
      page keeps a stable heading here and the hero copy drops out of the outline. */}
  <h1 className="sr-only">A little further, every day.</h1>
  {(profiles.length>1||instead)&&<div className="board-strip">
    {profiles.length>1&&<div className="profile-selector"><label htmlFor="view-user">Following</label><select id="view-user" value={selected || board?.selectedUsername || ""} onChange={event => openUser(event.target.value)}><option value="" disabled>Choose a user</option>{profiles.map(profile => <option key={profile.username} value={profile.username}>{profile.display_name} (@{profile.username})</option>)}</select></div>}
    {instead&&<p className="showing-instead" role="status">No board for @{instead} — showing {board.displayName} instead.</p>}
  </div>}
  {/* Board-level, not feed-level: the fetch that failed is the one every tab reads. */}
  {loadError && <><div className="empty" role="alert">{loadError}</div><button id="retry" onClick={() => load(false,true)}>Try again <Icon name="refresh" /></button></>}
  {/* THE PACE CARD AND THE PASSPHRASE CARD ARE NOT HERE. They are /settings/day and /settings/account,
      and a second live copy of either was the bug: two time-zone selects can disagree, and there must
      be exactly ONE route to /api/passphrase. lib/prefs.js RETIRED_WIDGETS retires their remembered
      open/closed keys, which is only correct because nothing on the board renders them any more. */}
  <TodayPanel hidden={tab!=='today'} board={board} user={user} today={today} timeZone={timeZone} stats={stats} loading={loading} loadError={loadError} composerRef={composerRef} load={load} notify={notify} clockPref={prefs.clock} compactFeed={prefs.compactFeed}/>
  <JournalPanel hidden={tab!=='study'} board={board} today={today} timeZone={timeZone} loading={loading} loadError={loadError} load={load} clockPref={prefs.clock} compactFeed={prefs.compactFeed}/>
  <ProgressPanel hidden={tab!=='progress'} board={board} stats={stats} today={today} measure={prefs.chartMeasure}/>
  <footer><a className="footer-brand" href="/">checkpoint.</a><p>A little progress, every day.</p><span>Days reset at 4 a.m. · {timeZone.replaceAll('_',' ')}</span></footer>
</main>
<EntryDialog ref={entryRef} modalRef={modalRef} setUser={setUser} selectedUser={selectedUser} load={load} onEntered={entered} onPassphrase={message=>{if(message)notify(message)}}/>
<div id="toast" role="status" className={toast ? "show" : ""}>{toast}</div></>;
}
