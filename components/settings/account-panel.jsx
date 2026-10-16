"use client";
import {useEffect,useRef,useState} from 'react';
import EntryDialog from '../entry-dialog.jsx';
import {api} from '../../lib/client.js';
import {Panel} from './controls.jsx';
const NOTE_MAX=140;
// THE PASSPHRASE CONTROLS LIVE HERE NOW, taken from the board's SignInCard: this is the only route
// from a signed-in session to /api/passphrase, so it may never be the panel that is left out.
// Eager, where the board's card was lazy: the card sat on every signed-in page view, so a
// checkpoint_credentials read on mount was a read nobody asked for. Opening Settings > Account IS
// asking, so both reads happen once, on arrival.
export default function AccountPanel({username}){
 const [data,setData]=useState(null),[guard,setGuard]=useState(null),[error,setError]=useState('');
 const [name,setName]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const modalRef=useRef(null),entryRef=useRef(null),selectedUser=useRef(username||'');
 const [nonce,setNonce]=useState(0);
 async function reload(){const result=await api('/api/settings');setData(result);setName(result.display_name||'');setNote(result.family_note||'')}
 useEffect(()=>{let live=true;reload().catch(problem=>{if(live)setError(problem.message)});return()=>{live=false}},[]);
 useEffect(()=>{let live=true;api('/api/passphrase').then(result=>{if(live)setGuard(result)}).catch(()=>{if(live)setGuard({unknown:true})});return()=>{live=false}},[nonce]);
 async function save(body,message){
  setBusy(true);setError('');setStatus('');
  try{await api('/api/settings',body);await reload();setStatus(message)}
  catch(problem){setError(problem.message)}finally{setBusy(false)}
 }
 // The cookie is cleared by the response, so this device has no session left to re-render against:
 // the board is where a signed-out visitor belongs, and it is one tap from signing back in.
 async function leave(all){
  setBusy(true);setError('');
  try{await api('/api/signout',all?{all:true}:{});window.location.assign('/')}
  catch(problem){setError(problem.message);setBusy(false)}
 }
 const on=guard?.protected===true,devices=data?.devices??0;
 return <>
  <Panel eyebrow="WHO THE FAMILY SEES" title="Your name and your line" lead="The display name heads your day on the board. The line below it is the one your parents read under “For the family”.">
   <form onSubmit={event=>{event.preventDefault();save({display_name:name},'Display name saved.')}}>
    <label htmlFor="display-name-field">Display name</label>
    <input id="display-name-field" value={name} maxLength={60} required onChange={event=>setName(event.target.value)} placeholder="Varun"/>
    <button className="settings-save" disabled={busy||!data||name.trim()===(data.display_name||'')}>Save name</button>
    <small>1 to 60 characters. It is the name on every post, old and new.</small>
   </form>
   <form onSubmit={event=>{event.preventDefault();save({family_note:note},'Your line is saved.')}}>
    <label htmlFor="family-note-field">A line for your family</label>
    <input id="family-note-field" value={note} maxLength={NOTE_MAX} onChange={event=>setNote(event.target.value)} placeholder="A little window into my day."/>
    <button className="settings-save" disabled={busy||!data||note===(data.family_note||'')}>Save the line</button>
    <button type="button" className="text-button" disabled={busy||!data?.family_note} onClick={()=>{setNote('');save({family_note:null},'Back to Checkpoint’s own line.')}}>Clear it</button>
    <small>{note.length} of {NOTE_MAX} characters. Leave it empty and the board writes its own line.</small>
   </form>
   <p className="settings-status" role="status">{status}</p>
   <p role="alert">{error}</p>
  </Panel>
  <Panel eyebrow="KEEP THIS USERNAME YOURS" title="Who can sign in as you" lead={on?<>A new device needs your passphrase as well as @{username}. Devices you already use stay signed in.</>:<>Anyone who knows @{username} can sign in as you. A passphrase changes that, and devices you already use stay signed in.</>}>
   <div className="sign-in-actions">
    <button type="button" className="settings-save" disabled={!guard||guard.unknown} onClick={()=>entryRef.current?.open(on?'change':'enroll',username)}>{on?'Change or remove':'Add a passphrase'}</button>
    <small>{guard?.unknown?'Your sign-in could not be checked just now.':on?'Changing or removing it needs that passphrase, or the recovery code you saved.':'You will get a recovery code to save. It is shown once.'}</small>
   </div>
  </Panel>
  <Panel eyebrow="THIS BROWSER AND THE OTHERS" title="Devices" lead="Each device keeps its own sign-in for 180 days. Signing out here leaves the others alone.">
   <p className="settings-hint"><span className="settings-count">{devices||'—'}</span> {devices===1?'device is signed in as':'devices are signed in as'} @{username}.</p>
   <div className="settings-actions">
    <button type="button" className="settings-save" disabled={busy} onClick={()=>leave(false)}>Sign out this device</button>
    <button type="button" className="text-button" disabled={busy} onClick={()=>leave(true)}>Sign out everywhere</button>
   </div>
   <small>Signing out everywhere ends every session, including this one. Your posts and your streak stay exactly as they are.</small>
  </Panel>
  <EntryDialog ref={entryRef} modalRef={modalRef} setUser={()=>{}} selectedUser={selectedUser} load={async()=>{}} onEntered={()=>{}} onPassphrase={message=>{setNonce(count=>count+1);if(message)setStatus(message)}}/>
 </>
}
