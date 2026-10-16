"use client";
import {useEffect} from 'react';
// The repo had no error.jsx, so a render failure fell through to Next's default page. This keeps the
// family inside Checkpoint and spends reset() on the retry they would otherwise do by hand.
export default function Error({error,reset}) {
  useEffect(()=>{console.error('Checkpoint page failed:',error)},[error]);
  return <main><section className="card"><div className="card-heading"><div><span className="eyebrow">A SMALL DETOUR</span><h2>This page did not load.</h2></div></div><p className="empty" role="alert">Something went wrong on our side. Nothing you saved is lost — the page just needs another try.</p><button className="primary" onClick={reset}>Try again</button></section></main>;
}
