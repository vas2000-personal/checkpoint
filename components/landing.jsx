import {IconLibrary} from './icons.jsx';
import Hero from './hero.jsx';
import {SLOTS} from './tabs/slugs.js';
// THE DOOR, NOT A WALL. app/page.jsx renders this instead of the board for a visitor with no session
// and no ?tab=/?user= in the URL; every button below is one tap into the board the next person in the
// family is already reading. The board stays public and stays the default for every link that names a
// tab or a user, so a bookmark, a shared link or a tab the board itself pushed still opens the board.
//
// A SERVER COMPONENT with no board data: this page has nothing per-viewer on it, so it costs no fetch
// and no session lookup. <Hero> is the board's own hero with board=null -- the same copy, art and
// mascots a reader meets on the Today tab, rather than a second drawing of the same idea that would
// then drift from it.
//
// The buttons read the SLOTS table both fixed bottom navs read, so the label, the order and the glyph
// here cannot disagree with the nav the visitor meets one tap later (SC 3.2.4).
const HREF={today:'/?tab=today',study:'/?tab=study',progress:'/?tab=progress',settings:'/settings'};
const BLURB={
 today:'Today’s checkpoint, study totals and the day as it happens.',
 study:'Every checkpoint written so far, newest first.',
 progress:'The streak, the level and the week at a glance.',
 settings:'Theme, text size, dark mode and your day. No account needed.',
};
export default function Landing(){
 return <><IconLibrary/>
  <header className="site-header"><div className="header-inner">
   <a className="brand" href="/?tab=today" aria-label="Checkpoint home"><span className="brand-icon"><svg><use href="#icon-flag"/></svg></span>checkpoint<span className="brand-dot">.</span></a>
   <span className="header-note">One day at a time.</span>
  </div></header>
  <main className="landing">
   {/* The board's h1 is screen-reader-only because its hero is a collapsed widget. Here the hero IS
       the page, so its heading is the real one and nothing is hidden from the outline. */}
   <Hero board={null} stats={{postedToday:false}} today=""/>
   <nav className="landing-nav" aria-label="Go to the board">
    <h2 className="landing-nav-heading">Where would you like to start?</h2>
    <ul>
     {SLOTS.map(([slug,label,icon])=>
      <li key={slug}><a className="landing-button" href={HREF[slug]}>
       <span className="landing-button-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href={"#icon-"+icon}/></svg></span>
       <span className="landing-button-text"><strong>{label}</strong><small>{BLURB[slug]}</small></span>
       <svg className="landing-button-arrow" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-arrow"/></svg>
      </a></li>)}
    </ul>
   </nav>
   <footer><a className="footer-brand" href="/?tab=today">checkpoint.</a><p>A little progress, every day.</p><span>Days reset at 4 a.m.</span></footer>
  </main></>;
}
