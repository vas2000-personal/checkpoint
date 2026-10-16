"use client";
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
// The settings sub-tabs are real route segments, so the current one comes from the pathname and is
// marked with aria-current rather than being held in a state nobody else can see. Link keeps the
// prefetch; a plain <a> would reload the whole frame on every tap.
const SECTIONS=[['display','Display'],['day','Your day'],['account','Account'],['miss-log','Miss Log'],['data','Your data']];
export default function SettingsNav(){
 const path=usePathname()||'';const strip=useRef(null);
 // The strip scrolls sideways rather than wrapping, so at 320px the current section can start off
 // screen — on Miss Log and Your data it always does. scrollLeft rather than scrollIntoView: that
 // method walks every scrollable ancestor and would jump the page itself on a deep link.
 useEffect(()=>{const list=strip.current,current=list?.querySelector('[aria-current=page]');if(!list||!current)return;list.scrollLeft=Math.max(0,current.offsetLeft-(list.clientWidth-current.offsetWidth)/2)},[path]);
 return <nav className="settings-nav" aria-label="Settings sections"><ul ref={strip}>{SECTIONS.map(([slug,label])=>{const href='/settings/'+slug,current=path===href||path.startsWith(href+'/');return <li key={slug}><Link href={href} aria-current={current?'page':undefined}>{label}</Link></li>})}</ul></nav>
}
