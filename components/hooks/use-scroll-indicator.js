"use client";
import {useEffect,useState} from 'react';
export default function useScrollIndicator(){
  useEffect(()=>{let timer;const position=()=>{const el=document.documentElement,indicator=document.querySelector('.scroll-indicator');if(!indicator)return;
    // Below 760px the board tabs are a fixed bar over the last 3.5rem of the viewport, so the thumb is
    // sized and travels inside what is left of it; above that the same bar is in flow and measures 0.
    const bar=document.querySelector('.board-tabs'),covered=bar&&getComputedStyle(bar).position==='fixed'?bar.offsetHeight:0;
    const height=window.innerHeight-covered,total=el.scrollHeight,size=Math.max(32,height*height/total);indicator.style.height=size+'px';indicator.style.transform='translateY('+((height-size)*window.scrollY/Math.max(1,total-height))+'px)';indicator.hidden=total<=height};const reveal=()=>{position();document.documentElement.classList.add('is-scrolling');clearTimeout(timer);timer=setTimeout(()=>document.documentElement.classList.remove('is-scrolling'),900)};position();window.addEventListener('resize',position);window.addEventListener('scroll',reveal,{passive:true});
    // The DOCUMENT changing length is the third trigger, and the one the board actually needs: a tab
    // swap moves scrollHeight by an order of magnitude (12,930px of Journal to 1,885px of Progress)
    // without a scroll or a resize, so the thumb kept the old tab's size and stayed visible on a tab
    // with nothing to scroll. Observing body, not documentElement: html is the scroll container and
    // its own box does not grow with its content.
    const grew=typeof ResizeObserver==='function'?new ResizeObserver(position):null;grew?.observe(document.body);
    return()=>{clearTimeout(timer);grew?.disconnect();window.removeEventListener('scroll',reveal);window.removeEventListener('resize',position);document.documentElement.classList.remove('is-scrolling')}},[]);
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{const scroll=()=>setScrolled(window.scrollY>60);scroll();window.addEventListener("scroll",scroll,{passive:true});return()=>window.removeEventListener("scroll",scroll)},[]);
  return scrolled;
}
