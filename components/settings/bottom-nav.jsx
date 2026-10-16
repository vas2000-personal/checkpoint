import {tabHref} from '../../lib/tabs.js';
import {SLOTS} from '../tabs/slugs.js';
// The board's own tabs, so a phone can get back without reaching for the header link. Hrefs come from
// lib/tabs.js, the one place that prints that query string, and it prints a ROOT-relative one: a bare
// '?tab=progress' resolved against /settings/display and stranded the reader in Settings with no
// board. Plain anchors: every one of them leaves this route, and the Settings slot points at the real
// /settings segment rather than the board's tab. The labels, order and glyphs are ../tabs/slugs.js's
// SLOTS, shared with components/board-tabs.jsx, so the two bars at the same screen position agree.
export default function SettingsBottomNav(){
 return <nav className="settings-bottom-nav" aria-label="Board sections">{SLOTS.map(([slug,label,icon])=>
  <a key={slug} href={slug==='settings'?'/settings/display':tabHref(slug)} aria-current={slug==='settings'?'page':undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><use href={"#icon-"+icon}/></svg><span>{label}</span></a>)}</nav>
}
