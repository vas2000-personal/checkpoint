"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
export default function useToast(){
  const [toast,setToast]=useState(''),toastTimer=useRef(null);
  const notify=useCallback(text=>{setToast(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3500)},[]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  return {toast,notify};
}
