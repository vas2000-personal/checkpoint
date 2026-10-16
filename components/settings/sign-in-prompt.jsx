"use client";
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import EntryDialog from '../entry-dialog.jsx';
import {PipNote} from './controls.jsx';
// A PROMPT, NEVER AN ERROR. Four of the five panels are session-scoped, and a signed-out visitor
// reaching one of them has done nothing wrong: the board is public and his parents will never have an
// account. The dialog is right here rather than back on the board, and router.refresh() is what turns
// a successful sign-in into the real panel without a reload.
export default function SignInPrompt({what,why}){
 const modalRef=useRef(null),entryRef=useRef(null),selectedUser=useRef('');
 const [,setUser]=useState('');const router=useRouter();
 const refresh=async()=>router.refresh();
 return <section className="card profile-settings settings-panel"><span className="eyebrow">SIGNED OUT</span>
  <PipNote title={what}>
   <p>{why}</p>
   <div className="settings-actions"><button type="button" className="settings-save" onClick={()=>entryRef.current?.open('signin')}>Sign in</button><button type="button" className="text-button" onClick={()=>entryRef.current?.open('signup')}>Create a new user</button></div>
   <p className="settings-hint">Everything under <a href="/settings/display">Display</a> works without signing in — text size, dark mode, contrast and motion all live on this device.</p>
  </PipNote>
  <EntryDialog ref={entryRef} modalRef={modalRef} setUser={setUser} selectedUser={selectedUser} load={refresh} onEntered={refresh} onPassphrase={refresh}/>
 </section>
}
