"use client";
// This one replaces the root layout, so globals.css never loads here: every rule has to be inline, and
// it stays plain on purpose — it only ever shows when the layout itself could not render.
export default function GlobalError({error,reset}) {
  return <html lang="en"><body style={{margin:0,minHeight:'100vh',display:'grid',placeItems:'center',padding:'1.5rem',background:'#f6f5ee',color:'#314f42',font:'1rem/1.7 system-ui,-apple-system,Segoe UI,sans-serif'}}>
    <main style={{maxWidth:'26rem',textAlign:'center'}}>
      <p style={{margin:0,fontSize:'0.75rem',fontWeight:600,letterSpacing:'0.08em'}}>CHECKPOINT</p>
      <h1 style={{margin:'0.5rem 0 0.75rem',fontSize:'1.5rem',fontWeight:500}}>This page did not load.</h1>
      <p style={{margin:'0 0 1.5rem'}} role="alert">Something went wrong before the page could start. Nothing you saved is lost.</p>
      <button onClick={reset} style={{padding:'0.75rem 1.25rem',border:0,borderRadius:'0.5rem',background:'#314f42',color:'#fff',font:'inherit',fontSize:'0.875rem',cursor:'pointer'}}>Try again</button>
    </main>
  </body></html>;
}
