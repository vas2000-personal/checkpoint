"use client";
import {useEffect,useState} from 'react';
import {api} from '../../lib/client.js';
import {Meta,Panel,PipNote,Switch} from './controls.jsx';
// EVERY FIELD ON THIS PANEL COMES FROM GET /api/settings, which is session-scoped and self-only, and
// NONE of it may come from /api/board. missLog.lastSyncAt is a received_at — a timestamp the public
// contract bans — and it is readable here only because this is the owner reading his own account.
// The key itself is not on the wire at all: only whether one exists and when it was made.
const when=(value,timeZone)=>{try{return new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone})}catch{return value}};
export default function MissLogPanel({username}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>{let live=true;api('/api/settings').then(result=>{if(live)setData(result)}).catch(problem=>{if(live)setError(problem.message)});return()=>{live=false}},[]);
 async function share(value){
  setBusy(true);setError('');setStatus('');
  try{await api('/api/settings',{share_awake:value});setData(current=>({...current,share_awake:value}));setStatus(value?'Your family can see when you are up.':'Your awake status is hidden again.')}
  catch(problem){setError(problem.message)}finally{setBusy(false)}
 }
 if(!data)return <Panel eyebrow="THE DESKTOP APP" title="Miss Log" lead={error||'Loading your sync…'}/>;
 const key=data.missLog,zone=data.time_zone;
 return <>
  <Panel eyebrow="THE DESKTOP APP" title="Miss Log" lead="Miss Log pushes your study totals to Checkpoint while it is open. Counts only: your questions, topics and notes never leave it.">
   <Meta rows={[
    ['Connected',key.connected?'Yes, synced in the last day':'Not in the last day'],
    ['Sync key',key.hasKey?'In place':'None yet'],
    ['Key added',key.hasKey&&key.keyCreatedAt?when(key.keyCreatedAt,zone):'—'],
    ['Last sync',key.lastSyncAt?when(key.lastSyncAt,zone):'No sync yet'],
   ]}/>
   {!key.hasKey&&<PipNote title="No sync key yet"><p>Checkpoint is waiting for its first sync. Until a key exists, Miss Log cannot post your totals and the board shows “Not connected”.</p></PipNote>}
   {/* THERE IS NO REVOKE ENDPOINT, AND SAYING SO IS BETTER THAN A BUTTON THAT CANNOT WORK:
       supabase/migrations/006 grants the server SELECT on checkpoint_api_keys and nothing more, so
       the Next server can see that a key exists but has no privilege to delete one. The honest
       control is the operator path, written out, until a migration and a route exist. */}
   <details className="settings-reveal"><summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>Revoking this key</summary><p className="settings-hint">Checkpoint can read that a key exists but cannot delete one: the server's database role is granted <code>select</code> on the key table and nothing else, so no page here can revoke it for you.</p><ol><li>Open the Checkpoint database and delete the row for @{username} in <code>checkpoint_api_keys</code>.</li><li>Miss Log's next sync answers 401 and stops. Paste the new key into Miss Log to start again.</li><li>This panel will read “None yet” and the board will say “Not connected”.</li></ol></details>
  </Panel>
  <Panel eyebrow="WHAT THE FAMILY SEES" title="Your awake status" lead="Miss Log also knows when your computer woke up. The board can show your family a plain “Awake” — never a time, and never how long you were at the desk.">
   <Switch label="Show my Awake status to the family" hint="Off hides the pill for everyone, including you. The times behind it are never published either way." on={data.share_awake!==false} onChange={share} disabled={busy}/>
   <p className="settings-status" role="status">{status}</p>
   <p role="alert">{error}</p>
  </Panel>
 </>
}
