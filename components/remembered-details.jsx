"use client";
import {useEffect,useRef} from 'react';
export default function RememberedDetails({storageKey,children,...props}){
 const ref=useRef(null),ready=useRef(false);
 useEffect(()=>{ready.current=false;try{ref.current.open=localStorage.getItem('checkpoint-widget:'+storageKey)==='open'}catch{}ready.current=true},[storageKey]);
 return <details {...props} ref={ref} onToggle={event=>{if(ready.current)try{localStorage.setItem('checkpoint-widget:'+storageKey,event.currentTarget.open?'open':'closed')}catch{}}}>{children}</details>
}
