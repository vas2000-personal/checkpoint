"use client";
import {Suspense,lazy,useRef,useState} from 'react';
import useDismissOutside from './hooks/use-dismiss-outside.js';
const DisplaySettings=lazy(()=>import('./display-settings.jsx'));
export default function SiteHeader({scrolled,user,onAuth,onEnterOrLeave}){
 const [menuOpen,setMenuOpen]=useState(false);
 const menuRef=useRef(null),menuButton=useRef(null);
 useDismissOutside(menuOpen,()=>setMenuOpen(false),menuRef,menuButton);
 return <header className={`site-header${scrolled?" is-scrolled":""}${menuOpen?" menu-open":""}`} onKeyDown={event=>{if(event.key==="Escape"){setMenuOpen(false);menuButton.current?.focus()}}}><div className="header-inner">
  <a className="brand" href="/" aria-label="Checkpoint home"><span className="brand-icon"><svg><use href="#icon-flag"/></svg></span>checkpoint<span className="brand-dot">.</span></a>
  <span className="header-note">One day at a time.</span>
  <button ref={menuButton} type="button" className="mobile-menu-button" aria-label={menuOpen?"Close menu":"Open menu"} aria-expanded={menuOpen} aria-controls="header-menu" onClick={()=>setMenuOpen(!menuOpen)}><svg viewBox="0 0 24 24" aria-hidden="true">{menuOpen?<path d="m6 6 12 12M18 6 6 18"/>:<path d="M4 6h16M4 12h16M4 18h16"/>}</svg></button>
  <div ref={menuRef} id="header-menu" className="header-actions"><Suspense fallback={<span className="display-loading" role="status" aria-label="Loading display preferences"/>}><DisplaySettings/></Suspense>{!user && <button className="new-user-button" onClick={() => {setMenuOpen(false);onAuth("signup")}}>New user</button>}<button onClick={() => {setMenuOpen(false);onEnterOrLeave()}} id="enter-button" className="header-action"><svg><use href="#icon-edit"/></svg><span>{user ? "Sign out" : "Sign in"}</span></button></div>
</div></header>;
}
