"use client";
import {useEffect,useImperativeHandle,useRef,useState} from 'react';
import {api} from '../lib/client.js';
// A dismissal has to survive the reload, and localStorage throws outright in a locked-down Safari, so
// a dismissal we cannot remember costs an extra offer rather than the whole dialog.
const skipKey=username=>'checkpoint.enroll.'+username;
const skipped=username=>{try{return localStorage.getItem(skipKey(username))==='skipped'}catch{return false}};
const remember=username=>{try{localStorage.setItem(skipKey(username),'skipped')}catch{}};
// A freshly minted recovery code is the one thing in this dialog that cannot be fetched again, so it
// is stashed the moment it arrives and cleared only by "I've saved it". That is what makes Escape,
// the brand link, a reload and a closed dialog recoverable instead of terminal, and it is why none of
// them has to be fought. sessionStorage, not localStorage: it is this tab only and dies with it, so
// an ordinary visit anywhere else still opens with nothing asked of anybody.
const codeKey=username=>'checkpoint.recovery.'+username;
export const heldRecoveryCode=username=>{try{return username&&sessionStorage.getItem(codeKey(username))||''}catch{return ''}};
const holdRecoveryCode=(username,code)=>{try{if(username&&code)sessionStorage.setItem(codeKey(username),code)}catch{}};
const forgetRecoveryCode=username=>{try{sessionStorage.removeItem(codeKey(username))}catch{}};
// Everything inside the dialog that a Tab can land on, in order, ignoring the hidden username decoy.
const TABBABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary';
export default function EntryDialog({ref,modalRef,setUser,selectedUser,load,onEntered,onPassphrase}){
  const [authMode,setAuthMode]=useState('signin'),[step,setStep]=useState('username'),[adding,setAdding]=useState(false),[reset,setReset]=useState(false),[enrolled,setEnrolled]=useState(false);
  const [username,setUsername]=useState(''),[displayName,setDisplayName]=useState(''),[account,setAccount]=useState('');
  const [passphrase,setPassphrase]=useState(''),[recovery,setRecovery]=useState(''),[chosen,setChosen]=useState(''),[again,setAgain]=useState('');
  const [current,setCurrent]=useState(''),[byRecovery,setByRecovery]=useState(false),[opened,setOpened]=useState(0);
  const [signOutOthers,setSignOutOthers]=useState(false),[code,setCode]=useState(''),[copied,setCopied]=useState(false);
  const [entering,setEntering]=useState(false),[joinError,setJoinError]=useState('');
  const usernameRef=useRef(null),passphraseRef=useRef(null),recoveryRef=useRef(null),chosenRef=useRef(null),offerRef=useRef(null),codeRef=useRef(null),currentRef=useRef(null);
  // 'signin'/'signup' start at the username box; 'enroll'/'change' are the signed-in board asking for
  // the passphrase controls, so they carry the username in rather than waiting to be told it.
  useImperativeHandle(ref,()=>({open(mode,who){
    const board=mode==='enroll'||mode==='change';
    // An unacknowledged code outranks whatever the caller asked for: it exists only because an
    // enrollment in this tab minted one and nobody has said "I've saved it" yet.
    const held=heldRecoveryCode(who);
    setAuthMode(board?'signin':mode);setStep(held?'recovery-code':board?mode==='change'?'manage':'enroll':'username');setAdding(mode==='enroll');setReset(false);setEnrolled(held?true:mode==='change');
    setJoinError('');setUsername('');setDisplayName('');setAccount(who||'');setPassphrase('');setRecovery('');setChosen('');setAgain('');setCurrent('');setByRecovery(false);
    setSignOutOthers(false);setCode(held);setCopied(false);setOpened(count=>count+1);modalRef.current.showModal();
  }}),[]);
  // showModal() would otherwise focus the first focusable child, which is the "checkpoint." home link,
  // so every step names its own first field. `opened` is in the deps because reopening on the step it
  // was already on changes nothing else, and that reopen still has to land the focus.
  useEffect(()=>{if(!modalRef.current?.open)return;
    const first={username:usernameRef,passphrase:passphraseRef,recovery:recoveryRef,enroll:adding?enrolled?currentRef:chosenRef:offerRef,manage:offerRef,remove:currentRef,'recovery-code':codeRef}[step];
    requestAnimationFrame(()=>first?.current?.focus());
  },[step,adding,enrolled,byRecovery,opened]);
  // Chromium's own wrap out of a modal <dialog> parks on BODY for one stop before re-entering, so the
  // ring vanishes mid-cycle. Wrapping it here keeps the cycle inside the dialog.
  function trapTab(event){
    if(event.key!=='Tab')return;
    const able=[...modalRef.current.querySelectorAll(TABBABLE)].filter(node=>node.tabIndex>=0&&node.offsetParent!==null);
    if(!able.length)return;
    const edge=event.shiftKey?able[0]:able[able.length-1];
    if(document.activeElement!==edge)return;
    event.preventDefault();(event.shiftKey?able[able.length-1]:able[0]).focus();
  }
  function finish(){modalRef.current.close();requestAnimationFrame(()=>onEntered?.())}
  // The ONE place the stash is cleared. Everything else that closes this dialog leaves the code where
  // reopening it, or reloading the page, will put it back on screen.
  function acknowledge(){forgetRecoveryCode(account);setCode('');finish()}
  // Authorising a change or a removal: the current passphrase, or the recovery code instead. Sent only
  // when the account is actually enrolled — a forced reset has no credential row left to authorise.
  const auth=()=>enrolled?byRecovery?{recovery:recovery.trim()}:{current}:{};
  // The offer is driven by THIS response and nothing else. Deriving it from the board payload would
  // show it to a visitor whose 180-day cookie is already paired with the site, which is the one thing
  // enrollment must never do.
  async function signedIn(result){
    const name=result.user.username;
    setUser(name);setAccount(name);selectedUser.current=name;
    // Any response carrying a one-time recovery code lands on the screen that shows it, whichever
    // route produced it. A dropped code is an account nobody can ever recover.
    if(result.recovery){setEnrolled(true);setCode(result.recovery);holdRecoveryCode(name,result.recovery);setCopied(false);setStep('recovery-code');await load(false,true);return}
    const offer=result.mustReset===true||result.enroll===true&&!skipped(name);
    if(!offer){modalRef.current.close();await load(false,true);requestAnimationFrame(()=>onEntered?.());return}
    setStep('enroll');setAdding(result.mustReset===true);setReset(result.mustReset===true);setEnrolled(false);setPassphrase('');setRecovery('');
    await load(false,true);
  }
  async function submit(event){
    event.preventDefault();setJoinError('');
    if(step==='enroll')return await enroll();
    if(step==='remove')return await drop();
    setEntering(true);
    try{
      const name=username.trim();
      // DECISION on signup-with-a-passphrase: the signup step stays username + display name, and new
      // users reach a passphrase through the offer this very response triggers (signup answers
      // enroll:true when no passphrase was sent). One enrollment path means one one-time-code screen
      // to get right, and the first screen of a family board does not tax everyone with a credential
      // the parents reading it will never set. The server's optional passphrase is still honoured:
      // signedIn() above shows the code screen for any response that carries one.
      const body=step==='passphrase'?{username:name,passphrase}:step==='recovery'?{username:name,recovery}:{username:name,displayName};
      await signedIn(await api(step==='username'&&authMode==='signup'?'/api/signup':'/api/enter',body));
    }catch(error){
      // needsPassphrase is the single flag that means "render the passphrase input". Arriving at it
      // from the username step is an instruction, not a failure: nothing was typed to be wrong yet,
      // and the step's own copy already says the username is protected. Once the field exists a
      // refusal is about what IS in it, so it is reported and the typing is kept.
      if(error.body?.needsPassphrase&&step==='username'){setStep('passphrase');setPassphrase('');if(error.status===401)return}
      setJoinError(error.message);
    }finally{setEntering(false)}
  }
  async function enroll(){
    // Answered here rather than by the server: a typo in the second box is not worth a round trip,
    // and the server would only ever see the one value anyway.
    if(chosen!==again)return setJoinError('Those two passphrases do not match.');
    setEntering(true);
    try{
      const result=await api('/api/passphrase',{passphrase:chosen,...auth(),...(signOutOthers?{signOutOthers:true}:{})});
      setChosen('');setAgain('');setCurrent('');setRecovery('');setEnrolled(true);onPassphrase?.();
      setCode(result.recovery);holdRecoveryCode(account,result.recovery);setCopied(false);setStep('recovery-code');
    }catch(error){
      // 409 is the server saying the account is already enrolled, which only happens when this form
      // was opened to ADD. The manage screen is where the fields that can authorise a change live.
      if(error.status===409){setEnrolled(true);setStep('manage');onPassphrase?.()}
      setJoinError(error.message);
    }finally{setEntering(false)}
  }
  async function drop(){
    setEntering(true);
    try{await api('/api/passphrase',{remove:true,...auth()});onPassphrase?.('Your passphrase has been removed.');finish()}
    catch(error){setJoinError(error.message)}finally{setEntering(false)}
  }
  async function copyCode(){try{await navigator.clipboard.writeText(code);setCopied(true)}catch{setCopied(false)}}
  const signup=authMode==='signup',name=account||username.trim(),handle='@'+name;
  // A password manager only offers to save a passphrase it can file under a username, and the username
  // box is unmounted by the time either password step renders. Out of the tab order on purpose.
  const hiddenUsername=<input className="sr-only" tabIndex={-1} aria-hidden="true" readOnly value={name} autoComplete="username" />;
  const authField=<div className="pass-field">{hiddenUsername}{byRecovery ? <><label htmlFor="auth-recovery">Recovery code</label><input ref={currentRef} id="auth-recovery" value={recovery} onChange={event => setRecovery(event.target.value)} maxLength={40} required autoComplete="off" spellCheck="false" autoCapitalize="characters" /></> : <><label htmlFor="current-passphrase">Your current passphrase</label><input ref={currentRef} id="current-passphrase" type="password" value={current} onChange={event => setCurrent(event.target.value)} maxLength={128} required autoComplete="current-password" /></>}<p className="pass-skip"><button type="button" className="text-button" onClick={() => {setJoinError("");setByRecovery(was => !was)}}>{byRecovery ? "Use my passphrase instead" : "Use my recovery code instead"}</button></p></div>;
  const heading=step==='passphrase'||step==='recovery'?'One more step.':step==='manage'?'Your sign-in.':step==='remove'?'Remove your passphrase?':step==='enroll'?reset?'Set a new passphrase.':enrolled?'Change your passphrase.':adding?'Add your passphrase.':'Keep this username yours?':step==='recovery-code'?'Save your recovery code.':signup?'Your next chapter starts here.':'Welcome back.';
  // The code screen is no longer a trap. It used to refuse onCancel and hide its close button, which
  // Chromium's close-watcher abuse protection overrode on the third Escape anyway, and the brand link
  // and a plain reload walked straight past both. The stash above is what makes every one of those
  // exits recoverable, so this screen closes like any other and "I've saved it" is what acknowledges.
  return <dialog id="entry-dialog" ref={modalRef} aria-labelledby="entry-dialog-title" onKeyDown={trapTab}><form id="join" onSubmit={submit}><div className="dialog-head"><a className="brand" href="/"><span className="brand-icon"><svg><use href="#icon-flag"/></svg></span>checkpoint.</a><button type="button" onClick={() => modalRef.current.close()} className="close" aria-label="Close"><svg><use href="#icon-close"/></svg></button></div>{(step === "username" || step === "enroll" && !adding) && <div className="dialog-mascot"><img src="/assets/pip.webp" alt="Pip is ready for your next checkpoint" width="125" height="145" decoding="async" loading="lazy" /></div>}{step === "username" && <div className="eyebrow">YOUR DAILY SAVE POINT</div>}<h2 id="entry-dialog-title">{heading}</h2><p>{step === "passphrase" ? <>{handle} is protected by a passphrase.</> : step === "recovery" ? <>Enter the recovery code you saved for {handle}. It signs you in and clears the passphrase, so you can set a new one.</> : step === "manage" ? enrolled ? <>{handle} is protected by a passphrase. Changing or removing it needs that passphrase, or the recovery code you saved.</> : <>{handle} has no passphrase yet. Anyone who knows the username can sign in as you.</> : step === "remove" ? <>{handle} goes back to username-only: anyone who knows it can sign in as you. You can add a passphrase again whenever you like.</> : step === "enroll" ? reset ? <>Your passphrase has been removed. Set a new one now so new devices still need it.</> : enrolled ? <>Choose a new passphrase. Your recovery code is replaced too, so there is a new one to save.</> : adding ? <>Choose something you’ll remember for {handle}. New devices will need it; devices you already use stay signed in. You’ll get a recovery code to save afterwards.</> : <>Right now anyone who knows {handle} can sign in as you. Add a passphrase and new devices will need it. Devices you already use stay signed in.</> : step === "recovery-code" ? <>If you forget your passphrase, this is the only way back in, and no one can reset it for you. While you still know your passphrase you can change it from Your sign-in, which issues a fresh code. This one waits here until you save it.</> : <>{signup ? "Pick a username and start sharing your progress." : "Enter your username to pick up where you left off."}<br />Your sign-in stays on this device.</>}</p>{step === "username" && <><label htmlFor="username">Your username</label><input ref={usernameRef} value={username} onChange={event => setUsername(event.target.value)} id="username" pattern="[A-Za-z0-9_]{2,24}" minLength="2" maxLength="24" placeholder="Enter your username" required autoComplete="username" aria-describedby="username-help" /><p id="username-help">Use 2–24 letters, numbers, or underscores.</p>{signup && <div className="display-name-field"><label htmlFor="display-name">Display name (optional)</label><input id="display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={60} placeholder="What should we call you?" /></div>}</>}{step === "passphrase" && <div className="pass-field">{hiddenUsername}<label htmlFor="passphrase">Your passphrase</label><input ref={passphraseRef} id="passphrase" type="password" value={passphrase} onChange={event => setPassphrase(event.target.value)} maxLength={128} required autoComplete="current-password" /></div>}{step === "recovery" && <div className="pass-field"><label htmlFor="recovery">Recovery code</label><input ref={recoveryRef} id="recovery" value={recovery} onChange={event => setRecovery(event.target.value)} maxLength={40} required autoComplete="off" spellCheck="false" autoCapitalize="characters" aria-describedby="recovery-help" /><p id="recovery-help" className="pass-help">The code you saved when you added your passphrase.</p></div>}{(step === "remove" || step === "enroll" && adding && enrolled) && authField}{step === "enroll" && adding && <div className="pass-field">{!enrolled && hiddenUsername}<label htmlFor="new-passphrase">New passphrase</label><input ref={chosenRef} id="new-passphrase" type="password" value={chosen} onChange={event => setChosen(event.target.value)} minLength={8} maxLength={128} required autoComplete="new-password" aria-describedby="new-passphrase-help" /><p id="new-passphrase-help" className="pass-help">Three or four words you’ll remember. At least 8 characters.</p><label htmlFor="again-passphrase">Type it again</label><input id="again-passphrase" type="password" value={again} onChange={event => setAgain(event.target.value)} minLength={8} maxLength={128} required autoComplete="new-password" /><label className="pass-check" htmlFor="sign-out-others"><input id="sign-out-others" type="checkbox" checked={signOutOthers} onChange={event => setSignOutOthers(event.target.checked)} />Sign out my other devices</label></div>}{step === "recovery-code" && <div className="pass-code"><code>{code}</code><button ref={codeRef} type="button" className="copy-code" onClick={copyCode}>{copied ? "Copied" : "Copy"}</button></div>}{step === "enroll" && !adding ? <><button ref={offerRef} type="button" id="join-button" className="primary" onClick={() => {setJoinError("");setAdding(true)}}>Add a passphrase <svg><use href="#icon-arrow"/></svg></button><p className="pass-skip"><button type="button" className="text-button" onClick={() => {remember(account);finish()}}>Not now</button></p></> : step === "manage" ? <><button ref={offerRef} type="button" id="join-button" className="primary" onClick={() => {setJoinError("");setAdding(true);setStep("enroll")}}>{enrolled ? "Change my passphrase" : "Add a passphrase"} <svg><use href="#icon-arrow"/></svg></button>{enrolled && <p className="pass-skip"><button type="button" className="text-button" onClick={() => {setJoinError("");setStep("remove")}}>Remove my passphrase</button></p>}</> : step === "recovery-code" ? <button type="button" id="join-button" className="primary" onClick={acknowledge}>I’ve saved it <svg><use href="#icon-arrow"/></svg></button> : <button disabled={entering} id="join-button" className="primary">{entering ? "One moment…" : step === "remove" ? "Remove it" : step === "enroll" ? "Save passphrase" : signup ? "Create my user" : "Sign in"} <svg><use href="#icon-arrow"/></svg></button>}<p id="join-error" role="alert">{joinError}</p>{step === "passphrase" && <p className="pass-skip"><button type="button" className="text-button" onClick={() => {setStep("recovery");setJoinError("");setPassphrase("")}}>I forgot my passphrase</button></p>}{step === "recovery" && <p className="pass-skip"><button type="button" className="text-button" onClick={() => {setStep("passphrase");setJoinError("");setRecovery("")}}>Back to the passphrase</button></p>}{step === "remove" && <p className="pass-skip"><button type="button" className="text-button" onClick={() => {setStep("manage");setJoinError("");setCurrent("");setRecovery("")}}>Keep my passphrase</button></p>}{step === "enroll" && adding && <p className="pass-skip"><button type="button" className="text-button" onClick={() => {setJoinError("");setChosen("");setAgain("");if(enrolled)setStep("manage");else setAdding(false)}}>Back</button></p>}{step === "username" && <><small className="privacy">The same username shares progress across your devices.</small><p><button type="button" className="text-button" onClick={() => {setAuthMode(mode => mode === "signup" ? "signin" : "signup");setJoinError("")}}>{signup ? "Already have a username? Sign in" : "New here? Create a user"}</button></p></>}</form></dialog>;
}
