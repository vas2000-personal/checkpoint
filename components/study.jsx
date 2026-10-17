"use client";
import {useEffect,useState} from 'react';
import RememberedDetails from './remembered-details.jsx';
import {clock,plural} from '../lib/study.js';
export function StudyLine({post,timeZone,today}){
 const live=typeof post.studying==='boolean';
 const [now,setNow]=useState(null);
 // Fallback only for payloads still shipping received_at instead of the server-computed `studying`; costs a timer per post.
 useEffect(()=>{if(live)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[live]);
 const s=post.study;if(!s)return null;
 const closed=now!==null&&now-Date.parse(post.received_at)>15*60*1000;
 const studying=live?post.studying:(post.message||'').startsWith('Studying now. ')&&!closed;
 return <div className="study-details"><div className="study-counts"><span><b>{s.minutes}</b> min</span><span><b>{s.sessions}</b> {plural(s.sessions,'session')}</span><span><b>{s.questions}</b> {plural(s.questions,'question')} ({s.questions?Math.round(s.correct/s.questions*100)+'%':'—'} correct)</span><span><b>{s.cards_reviewed}</b> {plural(s.cards_reviewed,'card')}</span>{s.target_minutes>0&&<span className={s.target_hit?'target-hit':'target-missed'}>{s.target_hit?'✓ Target hit':post.post_day===today?'Not hit yet':'Target missed'} · {s.target_minutes} min</span>}</div>{studying&&<span className="studying-badge">● Studying now</span>}</div>
}
export function AwakeStatus({awake,connected=true,onBreak=false}){
 if(awake)return <span className="awake-status" role="status"><span className="awake-dot" aria-hidden="true"/>Awake</span>;
 // No contact from Miss Log for a day (app not running, PC off, or a key problem). Quiet on a break.
 if(!connected&&!onBreak)return <span className="awake-status off" role="status"><span className="awake-dot" aria-hidden="true"/>Not connected</span>;
 return null;
}
export function StudyStatus({daily,awake,connected,onBreak,displayName,timeZone,today,loading}){
 const s=daily?.study;
 const cells=[['Minutes',s?.minutes],['Sessions',s?.sessions],['Questions',s?.questions],['Correct',s?String(s.correct)+' / '+s.questions:undefined],['Accuracy',s?.questions?Math.round(s.correct/s.questions*100)+'%':undefined],['Cards reviewed',s?.cards_reviewed],...(s&&s.target_minutes===0?[]:[['Daily target',s?s.target_minutes+' min':undefined],['Target status',s?(s.target_hit?'Hit ✓':'Not hit yet'):undefined]])];
 return <section className="study-status-bar" aria-label="Cumulative study status"><div className="study-status-heading"><div><span className="eyebrow">TODAY’S STUDY TOTALS</span><strong>{displayName||'Your study day'}{!loading&&<AwakeStatus awake={awake} connected={connected} onBreak={onBreak}/>}{today&&' · '+new Date(today+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</strong></div><span>Resets at 4 a.m. · {timeZone.replaceAll('_',' ')}</span></div><RememberedDetails storageKey="study-metrics" className="study-metric-details"><summary><span className="study-quick-totals">{loading?"Loading totals…":`${s?.minutes||0} min · ${s?.questions||0} questions · ${s?.cards_reviewed||0} cards`}</span><span className="metric-expand">Details</span></summary><div className="study-status-grid">{cells.map(([label,value])=><div key={label}><small>{label}</small><b>{value===undefined?(loading?'—':label==='Accuracy'||label==='Daily target'||label==='Target status'?'—':0):value}</b></div>)}</div></RememberedDetails>{daily?<><p className="study-status-text">{daily.message}</p><StudyLine post={daily} timeZone={timeZone} today={today}/></>:<p className="study-status-text">{loading?'Loading today’s totals…':'Waiting for Miss Log’s first sync this study day.'}</p>}</section>
}
export function HourLabel({post,timeZone,clockPref}){
 if(!post.study||!post.bucket_start)return null;
 const start=new Date(post.bucket_start),end=new Date(+start+3600000);
 return <div className="hour-summary-label">Hourly summary · {clock(start,timeZone,false,clockPref)}–{clock(end,timeZone,true,clockPref)}<small>Cumulative totals by the end of this hour · updates as Miss Log syncs</small></div>
}
// `measure` is lib/prefs.js's chartMeasure: the toggle used to reset to minutes on every visit, which
// is the whole reason that preference exists. The sync effect is not a second source of truth — prefs
// reach the board in dashboard.jsx's layout effect, BEFORE the first paint, so the only value it ever
// writes is the stored one; a later change comes from /settings/display, which is a different route.
export function StudyWeek({weekly,measure='minutes'}){
 const [metric,setMetric]=useState(measure),days=weekly?.days||[],value=d=>Number(d[metric])||0,maximum=Math.max(1,...days.map(value));
 useEffect(()=>setMetric(measure),[measure]);
 return <div className="study-week"><div className="study-chart-heading"><strong>Study this week</strong><div className="chart-toggle" role="group" aria-label="Study chart measure">{['minutes','questions'].map(m=><button key={m} type="button" aria-pressed={metric===m} className={metric===m?'active':''} onClick={()=>setMetric(m)}>{m==='minutes'?'Minutes':'Questions'}</button>)}</div></div><div className="study-chart" role="img" aria-label={days.map(d=>d.date+': '+value(d)+' '+metric).join('; ')||'No study totals yet'}>{days.map(d=><div className="study-bar-column" key={d.date} title={d.date+': '+value(d)+' '+metric}><span className="study-bar-value">{value(d)}</span><div className="study-bar-track"><i style={{height:Math.max(value(d)?4:0,value(d)/maximum*100)+'%'}}/></div><small>{new Date(d.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small></div>)}</div><div className="weekly-totals"><div><strong>{weekly?.minutes||0}</strong><small>minutes</small></div><div><strong>{weekly?.questions||0}</strong><small>questions</small></div><div><strong>{weekly?.accuracy==null?'—':weekly.accuracy+'%'}</strong><small>correct overall</small></div></div><p className="study-privacy">Counts only. Your questions and notes stay in Miss Log.</p></div>
}
// ProfileSettings LIVED HERE and is now components/settings/day-panel.jsx, the single home for the
// time zone and the break. It was removed rather than re-exported: a second live copy of a control
// that decides streaks and which 4 a.m. a day turns over on could disagree with the one in Settings.
export function HomeScreenTip(){
 const [installed,setInstalled]=useState(false);
 useEffect(()=>setInstalled(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true),[]);
 if(installed)return null;
 return <details className="home-screen-tip compact-widget"><summary><span><strong>Keep Checkpoint on your Home Screen</strong></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div className="widget-content"><p>On iPhone, open this page in Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if prompted.</p><p>Miss Log syncs while it’s open. Checkpoint refreshes when you return; it needs an internet connection.</p></div></details>
}
