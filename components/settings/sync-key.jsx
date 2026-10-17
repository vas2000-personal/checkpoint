"use client";
import {useState} from 'react';
import {api,remove} from '../../lib/client.js';
import {PipNote} from './controls.jsx';
// THE SYNC KEY, ISSUED AND REVOKED FROM THE PAGE INSTEAD OF FROM psql. This replaces the paragraph
// that used to explain how to delete a row by hand, which was honest but was not a control.
//
// A NEW KEY DOES NOT REPLACE THE OLD ONE. Both work until the owner revokes one, so the order is:
// make a key, paste it into Miss Log, watch a sync land, then revoke the key the old machine held.
// Rotating by breaking the live connection first is how a sync quietly stays down for a day, so the
// copy here says it in as many words rather than leaving it to be discovered.
//
// THE KEY IS ON SCREEN ONCE. It is never stored by the server and never fetched again, so this is the
// only moment it exists outside Miss Log; the reveal stays until it is dismissed, and nothing here
// writes it to localStorage, a URL or an analytics call. Closing it is the owner saying he has it.
const when=(value,timeZone)=>{try{return new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone})}catch{return value}};
export default function SyncKey({keys=[],timeZone,onChange}){
 const [issued,setIssued]=useState(null),[copied,setCopied]=useState(false);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [confirming,setConfirming]=useState('');
 async function generate(){
  setBusy('new');setError('');setStatus('');setCopied(false);
  try{
   const result=await api('/api/sync-key',{});
   setIssued(result);
   setStatus(keys.length?'New key ready. Your current key still works until you revoke it.':'Your first sync key is ready.');
   onChange?.();
  }catch(problem){setError(problem.message)}finally{setBusy('')}
 }
 async function revoke(id){
  setBusy(id||'all');setError('');setStatus('');
  try{
   const result=await remove('/api/sync-key'+(id?'?id='+encodeURIComponent(id):''));
   setConfirming('');
   // A key that is revoked while its plaintext is still on screen must not keep being offered.
   if(issued&&(!id||issued.id===id))setIssued(null);
   setStatus(id?'That key is revoked. Miss Log will get a 401 if it still holds it.':`Miss Log is disconnected. ${result.removed} key${result.removed===1?'':'s'} revoked.`);
   onChange?.();
  }catch(problem){setError(problem.message)}finally{setBusy('')}
 }
 async function copy(){try{await navigator.clipboard.writeText(issued.key);setCopied(true)}catch{setCopied(false)}}
 return <div className="sync-key">
  {keys.length>0&&<ul className="sync-key-list">
   {keys.map(key=><li key={key.id}>
    <span className="sync-key-id"><code>{key.id}…</code><small>Made {when(key.createdAt,timeZone)}</small></span>
    {confirming===key.id
     ?<span className="sync-key-confirm"><strong>Revoke this key?</strong><button type="button" className="sync-key-danger" disabled={!!busy} onClick={()=>revoke(key.id)}>{busy===key.id?'Revoking…':'Yes, revoke'}</button><button type="button" className="text-button" disabled={!!busy} onClick={()=>setConfirming('')}>Keep it</button></span>
     :<button type="button" className="sync-key-revoke" disabled={!!busy} onClick={()=>{setConfirming(key.id);setError('');setStatus('')}}>Revoke</button>}
   </li>)}
  </ul>}
  {!keys.length&&!issued&&<PipNote title="No sync key yet"><p>Checkpoint is waiting for its first sync. Until a key exists, Miss Log cannot post your totals and the board shows “Not connected”.</p></PipNote>}
  {issued&&<div className="sync-key-reveal" role="group" aria-labelledby="sync-key-heading">
   <h4 id="sync-key-heading">Your new sync key</h4>
   <p>This is the only time it is shown. Paste it into Miss Log now; if you lose it, make another one — it cannot be looked up.</p>
   <div className="pass-code"><code>{issued.key}</code><button type="button" className="copy-code" onClick={copy}>{copied?'Copied':'Copy'}</button></div>
   <button type="button" className="text-button" onClick={()=>{setIssued(null);setCopied(false)}}>I’ve saved it</button>
  </div>}
  <div className="sync-key-actions">
   <button type="button" className="primary" disabled={!!busy} onClick={generate}>{busy==='new'?'Making a key…':keys.length?'Make another key':'Make a sync key'} <svg><use href="#icon-arrow"/></svg></button>
   {keys.length>1&&(confirming==='all'
    ?<span className="sync-key-confirm"><strong>Disconnect Miss Log?</strong><button type="button" className="sync-key-danger" disabled={!!busy} onClick={()=>revoke('')}>{busy==='all'?'Revoking…':'Yes, revoke all'}</button><button type="button" className="text-button" disabled={!!busy} onClick={()=>setConfirming('')}>Cancel</button></span>
    :<button type="button" className="text-button" disabled={!!busy} onClick={()=>{setConfirming('all');setError('');setStatus('')}}>Revoke every key</button>)}
  </div>
  <p className="settings-hint">Rotating: make a new key, paste it into Miss Log, wait for a sync to land, then revoke the old one. Your current key keeps working the whole time.</p>
  <p className="settings-status" role="status">{status}</p>
  <p role="alert">{error}</p>
 </div>;
}
