import {IconLibrary} from '../../components/icons.jsx';
import SettingsNav from '../../components/settings-nav.jsx';
import SettingsBottomNav from '../../components/settings/bottom-nav.jsx';
export const metadata={title:'Settings · Checkpoint',description:'Display, your day, your account, Miss Log and your data.'};
// The sub-sections are real route segments rather than tab state: each panel owns its own data, a
// deep link into one of them is a normal URL, and Link prefetches the next one. The board's tabs
// cannot do that because they share one polling payload; these share nothing.
export default function SettingsLayout({children}){
 return <><IconLibrary/>
  <header className="site-header"><div className="header-inner">
   <a className="brand" href="/" aria-label="Checkpoint home"><span className="brand-icon"><svg><use href="#icon-flag"/></svg></span>checkpoint<span className="brand-dot">.</span></a>
   <a className="header-action settings-back" href="/"><svg><use href="#icon-arrow"/></svg><span>Back to the board</span></a>
  </div></header>
  <main className="settings-main">
   <div className="settings-head"><span className="eyebrow">YOUR CHECKPOINT</span><h1>Settings</h1><p>Five small pages. Display works signed out, because the people reading this board mostly are.</p></div>
   <SettingsNav/>
   <div className="settings-body">{children}</div>
   <footer><a className="footer-brand" href="/">checkpoint.</a><p>A little progress, every day.</p><span>Days reset at 4 a.m.</span></footer>
  </main>
  <SettingsBottomNav/></>
}
