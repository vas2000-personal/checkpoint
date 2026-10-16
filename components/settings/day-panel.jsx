"use client";
import {useEffect,useState} from 'react';
import {api} from '../../lib/client.js';
import {studyDay} from '../../lib/days.js';
import {Panel} from './controls.jsx';
// ABSORBED FROM components/study.jsx ProfileSettings, SEMANTICS UNCHANGED: the same zone list in the
// same order, the same "use this device's zone" button that saves as it sets, the same inclusive
// break-until date and the same "Resume today". Breaks and zones decide streaks and which 4 a.m. a
// day turns over on, so this panel is a move, not a redesign.
const ZONES=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','Asia/Kolkata','UTC'];
export default function DayPanel(){
 const [data,setData]=useState(null),[zone,setZone]=useState(''),[until,setUntil]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{let live=true;api('/api/settings').then(result=>{if(!live)return;setData(result);setZone(result.time_zone)}).catch(problem=>{if(live)setError(problem.message)});return()=>{live=false}},[]);
 const timeZone=data?.time_zone||'',today=timeZone?studyDay(new Date(),timeZone):'';
 const zones=[...new Set([timeZone,...ZONES].filter(Boolean))];
 async function save(body,message){
  setBusy(true);setError('');setStatus('');
  // Re-read rather than trust the echo: the break branch answers {ok:true} only, and the panel still
  // has to show whether a break is now running.
  try{await api('/api/settings',body);const fresh=await api('/api/settings');setData(fresh);setZone(fresh.time_zone);setUntil('');setStatus(message)}
  catch(problem){setError(problem.message)}finally{setBusy(false)}
 }
 if(!data)return <Panel eyebrow="MAKE ROOM FOR REAL LIFE" title="Your day, your pace" lead={error||'Loading your day…'}/>;
 return <Panel eyebrow="MAKE ROOM FOR REAL LIFE" title="Your day, your pace" lead={'New days start at 4 a.m. in this zone, and a break protects the streak without pretending you studied.'}>
  <form onSubmit={event=>{event.preventDefault();save({time_zone:zone},'Time zone saved.')}}>
   <label htmlFor="time-zone">Time zone</label>
   <select id="time-zone" value={zone} onChange={event=>setZone(event.target.value)}>{zones.map(name=><option key={name} value={name}>{name.replaceAll('_',' ')}</option>)}</select>
   <button type="button" className="text-button" disabled={busy} onClick={()=>{const local=Intl.DateTimeFormat().resolvedOptions().timeZone;setZone(local);save({time_zone:local},'Time zone saved.')}}>Use this device’s time zone</button>
   <button className="settings-save" disabled={busy||zone===timeZone}>Save time zone</button>
   <small>New days follow this zone. Saved days stay where they are.</small>
  </form>
  {data.activeBreak
   ?<div className="break-controls"><p>On a break through {data.activeBreak.until_day}. Your streak is protected while you rest.</p><button type="button" className="settings-save" disabled={busy} onClick={()=>save({holiday:false},'Welcome back. Today counts again.')}>Resume today</button></div>
   :<form onSubmit={event=>{event.preventDefault();save({holiday:true,until},'Break saved. Rest well.')}}><label htmlFor="break-until">Take a break through</label><input id="break-until" type="date" min={today} value={until} onChange={event=>setUntil(event.target.value)} required/><button className="settings-save" disabled={busy}>Start break</button><small>Break days protect your streak without adding XP. The last day is included.</small></form>}
  <p className="settings-status" role="status">{status}</p>
  <p role="alert">{error}</p>
 </Panel>
}
