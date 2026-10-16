"use client";
import ErrorBoundary from '../error-boundary.jsx';
import Scoreboard from '../scoreboard.jsx';
import Adventure from '../adventure.jsx';
import WeekWidget from '../week-widget.jsx';
// Everything that counts, with nothing to open first: the tab is the disclosure, so the tiles, the
// trail and the week sit on the page. The headings are screen-reader only because the tab label and
// each card's own heading already name what this is.
export default function ProgressPanel({hidden,board,stats,today,measure}){
 return <section className="tab-panel" id="panel-progress" aria-label="Progress" hidden={hidden}>
  <h2 className="sr-only">Your progress</h2>
  <Scoreboard board={board} stats={stats}/>
  <div className="progress-grid">
   <ErrorBoundary fallback={<div className="empty">The trail could not be drawn right now.</div>}><Adventure board={board} stats={stats}/></ErrorBoundary>
   <ErrorBoundary fallback={<div className="empty">This week could not be shown right now.</div>}><WeekWidget board={board} stats={stats} today={today} measure={measure}/></ErrorBoundary>
  </div>
 </section>;
}
