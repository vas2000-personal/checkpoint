"use client";
import {useEffect} from 'react';
// Refs and the setter are stable, so `open` alone drives the subscription, exactly as the two inline
// copies of this effect did before they were merged here.
export default function useDismissOutside(open,dismiss,...refs){
  useEffect(()=>{if(!open)return;const close=e=>{if(!refs.some(ref=>ref.current?.contains(e.target)))dismiss()};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
}
