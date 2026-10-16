"use client";
import {useEffect,useState} from 'react';
export default function useScrollIndicator(){
  useEffect(()=>{let timer;const position=()=>{const el=document.documentElement,indicator=document.querySelector('.scroll-indicator');if(!indicator)return;const height=window.innerHeight,total=el.scrollHeight,size=Math.max(32,height*height/total);indicator.style.height=size+'px';indicator.style.transform='translateY('+((height-size)*window.scrollY/Math.max(1,total-height))+'px)';indicator.hidden=total<=height};const reveal=()=>{position();document.documentElement.classList.add('is-scrolling');clearTimeout(timer);timer=setTimeout(()=>document.documentElement.classList.remove('is-scrolling'),900)};position();window.addEventListener('resize',position);window.addEventListener('scroll',reveal,{passive:true});return()=>{clearTimeout(timer);window.removeEventListener('scroll',reveal);window.removeEventListener('resize',position);document.documentElement.classList.remove('is-scrolling')}},[]);
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{const scroll=()=>setScrolled(window.scrollY>60);scroll();window.addEventListener("scroll",scroll,{passive:true});return()=>window.removeEventListener("scroll",scroll)},[]);
  return scrolled;
}
