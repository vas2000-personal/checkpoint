"use client";
import {useEffect,useState} from 'react';
import {attrs,read,write} from '../lib/prefs.js';
// The floating hamburger is gone: its whole contents were the display controls and the account
// buttons, display lives on /settings now, and stacking a menu on top of a bottom nav is two ways to
// reach the same four things. Dark mode is the one control that stays, at every width, because a
// parent reading at night should not have to walk to another page to turn the lights down. The write
// goes through lib/prefs.js so the other nine preferences survive the toggle, and the six stamped
// attributes are re-applied exactly as the blocking boot script writes them.
export default function SiteHeader({scrolled,user,onAuth,onEnterOrLeave}){
 const [dark,setDark]=useState(false);
 useEffect(()=>setDark(read(localStorage).dark),[]);
 function toggleDark(){const next=write(localStorage,{...read(localStorage),dark:!dark});setDark(next.dark);Object.assign(document.documentElement.dataset,attrs(next))}
 return <header className={`site-header${scrolled?" is-scrolled":""}`}><div className="header-inner">
  <a className="brand" href="/" aria-label="Checkpoint home"><span className="brand-icon"><svg><use href="#icon-flag"/></svg></span>checkpoint<span className="brand-dot">.</span></a>
  <span className="header-note">One day at a time.</span>
  <div className="header-actions">
   <div className="display-controls" role="group" aria-label="Display preferences"><button type="button" className="display-button" aria-label="Dark mode" aria-pressed={dark} title="Dark mode" onClick={toggleDark}><svg viewBox="0 0 24 24" aria-hidden="true">{dark?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>:<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>}</svg></button></div>
   {/* The phone reaches Settings through the bottom nav, so this link stands down below 760px. */}
   <a className="header-settings" href="/settings">Settings</a>
   {!user && <button className="new-user-button" onClick={() => onAuth("signup")}>New user</button>}
   <button onClick={onEnterOrLeave} id="enter-button" className="header-action"><svg><use href="#icon-edit"/></svg><span>{user ? "Sign out" : "Sign in"}</span></button>
  </div>
</div></header>;
}
