"use client";
export default function Scoreboard({board,stats}){
 return <section className="stats" aria-label="Progress scoreboard">
    <div className="stat"><span className="stat-icon"><svg><use href="#icon-star"/></svg></span><div><small>TOTAL EXPERIENCE</small><strong id="xp">{board ? stats.xp : "—"} <em>XP</em></strong></div><span className="stat-detail">Little wins add up</span></div>
    <div className="stat"><span className="stat-icon amber"><svg><use href="#icon-fire"/></svg></span><div><small>CURRENT STREAK</small><strong id="streak">{board ? stats.streak : "—"} <em>days</em></strong></div><span className="stat-detail">Keep the momentum</span></div>
    <div className="stat"><span className="stat-icon sage"><svg><use href="#icon-check"/></svg></span><div><small>DAYS OF PROGRESS</small><strong id="days">{board ? stats.days.length : "—"}</strong></div><span className="stat-detail">Proof of showing up</span></div>
    <div className="stat"><span className="stat-icon rose"><svg><use href="#icon-mountain"/></svg></span><div><small>ADVENTURE LEVEL</small><strong id="level">{board ? stats.level : "—"}</strong></div><span className="stat-detail">Onward & upward</span></div>
  </section>;
}
