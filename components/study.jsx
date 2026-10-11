"use client";
import {useEffect,useState} from 'react';
export function StudyLine({post,timeZone}){
 const [now,setNow]=useState(null);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[]);
 const s=post.study;if(!s)return null;
 const closed=now!==null&&now-Date.parse(post.received_at)>15*60*1000;
 const studying=(post.message||'').startsWith('Studying now. ')&&!closed;
 const time=new Date(post.source_updated_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone});
 return <div className="study-details"><div className="study-counts"><span><b>{s.minutes}</b> min</span><span><b>{s.sessions}</b> sessions</span><span><b>{s.questions}</b> questions ({s.questions?Math.round(s.correct/s.questions*100)+'%':'—'} correct)</span><span><b>{s.cards_reviewed}</b> cards</span>{s.target_minutes>0&&<span className={s.target_hit?'target-hit':'target-missed'}>{s.target_hit?'✓ Target hit':'Target missed'} · {s.target_minutes} min</span>}</div>{studying&&<span className="studying-badge">● Studying now</span>}<small className={closed?'sync-status closed':'sync-status'}><span aria-hidden="true">{closed?'○':'●'}</span> Miss Log · {closed?'not studying right now':'last updated '+time.toLowerCase()} {closed&&<span className="sync-help">· last updated {time.toLowerCase()}</span>}</small></div>
}
export function StudyStatus({daily,displayName,timeZone,today,loading}){
 const s=daily?.study;
 const cells=[['Minutes',s?.minutes],['Sessions',s?.sessions],['Questions',s?.questions],['Correct',s?String(s.correct)+' / '+s.questions:undefined],['Accuracy',s?.questions?Math.round(s.correct/s.questions*100)+'%':undefined],['Cards reviewed',s?.cards_reviewed],...(s&&s.target_minutes===0?[]:[['Daily target',s?s.target_minutes+' min':undefined],['Target status',s?(s.target_hit?'Hit ✓':'Not hit yet'):undefined]])];
 return <section className="study-status-bar" aria-label="Cumulative study status"><div className="study-status-heading"><div><span className="eyebrow">TODAY’S STUDY TOTALS</span><strong>{displayName||'Your study day'}{today&&' · '+new Date(today+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</strong></div><span>Resets at 4 a.m. · {timeZone.replaceAll('_',' ')}</span></div><div className="study-status-grid">{cells.map(([label,value])=><div key={label}><small>{label}</small><b>{value===undefined?(loading?'—':label==='Accuracy'||label==='Daily target'||label==='Target status'?'—':0):value}</b></div>)}</div>{daily?<><p className="study-status-text">{daily.message}</p><StudyLine post={daily} timeZone={timeZone}/></>:<p className="study-status-text">{loading?'Loading today’s totals…':'Waiting for Miss Log’s first sync this study day.'}</p>}</section>
}
export function HourLabel({post,timeZone}){
 if(!post.study||!post.bucket_start)return null;
 const start=new Date(post.bucket_start),end=new Date(+start+3600000);
 const fmt=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone,timeZoneName:'short'});
 return <div className="hour-summary-label">Hourly summary · {fmt(start)}–{fmt(end)}<small>Cumulative totals by the end of this hour · updates as Miss Log syncs</small></div>
}
export function StudyWeek({weekly}){
 const [metric,setMetric]=useState('minutes'),days=weekly?.days||[],maximum=Math.max(1,...days.map(d=>d[metric]));
 return <div className="study-week"><div className="study-chart-heading"><strong>Study this week</strong><div className="chart-toggle" role="group" aria-label="Study chart measure">{['minutes','questions'].map(m=><button key={m} type="button" aria-pressed={metric===m} className={metric===m?'active':''} onClick={()=>setMetric(m)}>{m==='minutes'?'Minutes':'Questions'}</button>)}</div></div><div className="study-chart" role="img" aria-label={days.map(d=>d.date+': '+d[metric]+' '+metric).join('; ')||'No study totals yet'}>{days.map(d=><div className="study-bar-column" key={d.date} title={d.date+': '+d[metric]+' '+metric}><span className="study-bar-value">{d[metric]}</span><div className="study-bar-track"><i style={{height:Math.max(d[metric]?4:0,d[metric]/maximum*100)+'%'}}/></div><small>{new Date(d.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small></div>)}</div><div className="weekly-totals"><div><strong>{weekly?.minutes||0}</strong><small>minutes</small></div><div><strong>{weekly?.questions||0}</strong><small>questions</small></div><div><strong>{weekly?.accuracy==null?'—':weekly.accuracy+'%'}</strong><small>correct overall</small></div></div><p className="study-privacy">Counts only. Your questions and notes stay in Miss Log.</p></div>
}
export function ProfileSettings({timeZone,today,activeBreak,onSave}){
 const [zone,setZone]=useState(timeZone),[until,setUntil]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setZone(timeZone),[timeZone]);
 const zones=[...new Set([timeZone,'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','Asia/Kolkata','UTC'])];
 async function save(body){setBusy(true);setError('');try{await onSave(body)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="card profile-settings"><span className="eyebrow">MAKE ROOM FOR REAL LIFE</span><h3>Your day, your pace</h3><form onSubmit={e=>{e.preventDefault();save({time_zone:zone})}}><label htmlFor="time-zone">Time zone</label><select id="time-zone" value={zone} onChange={e=>setZone(e.target.value)}>{zones.map(z=><option key={z} value={z}>{z.replaceAll('_',' ')}</option>)}</select><button type="button" className="text-button" onClick={()=>{const local=Intl.DateTimeFormat().resolvedOptions().timeZone;setZone(local);save({time_zone:local})}} disabled={busy}>Use this device’s time zone</button><button className="settings-save" disabled={busy||zone===timeZone}>Save time zone</button><small>New days follow this zone. Saved days stay where they are.</small></form>{activeBreak?<div className="break-controls"><p>Your streak is protected while you rest.</p><button disabled={busy} className="settings-save" onClick={()=>save({holiday:false})}>Resume today</button></div>:<form onSubmit={e=>{e.preventDefault();save({holiday:true,until})}}><label htmlFor="break-until">Take a break through</label><input id="break-until" type="date" min={today} value={until} onChange={e=>setUntil(e.target.value)} required/><button className="settings-save" disabled={busy}>Start break</button><small>Break days protect your streak without adding XP.</small></form>}<p role="alert">{error}</p></section>
}
export function HomeScreenTip(){
 const [installed,setInstalled]=useState(false);
 useEffect(()=>setInstalled(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true),[]);
 if(installed)return null;
 return <details className="home-screen-tip"><summary>Keep Checkpoint on your Home Screen</summary><p>On iPhone, open this page in Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if prompted.</p><p>Miss Log syncs while it’s open. Checkpoint refreshes when you return; it needs an internet connection.</p></details>
}
