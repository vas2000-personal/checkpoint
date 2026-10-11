export function Icon({name, ...props}) { return <svg aria-hidden="true" {...props}><use href={`#icon-${name}`} /></svg>; }
export function IconLibrary() { return (<svg className="svg-library" aria-hidden="true"><defs>
  <symbol id="icon-flag" viewBox="0 0 24 24"><path d="M5 21V3m0 1c6-4 8 4 15 0v10c-7 4-9-4-15 0"/></symbol>
  <symbol id="icon-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></symbol>
  <symbol id="icon-star" viewBox="0 0 24 24"><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/></symbol>
  <symbol id="icon-fire" viewBox="0 0 24 24"><path d="M13 3c1 5-4 6-3 10 2 0 4-2 4-4 3 3 5 6 4 9-2 5-10 5-12 0-2-4 0-7 2-9-1 3 1 4 2 3-1-4 2-6 3-9Z"/></symbol>
  <symbol id="icon-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
  <symbol id="icon-mountain" viewBox="0 0 24 24"><path d="m2 20 10-16 10 16Zm6-10 4 3 4-3"/></symbol>
  <symbol id="icon-edit" viewBox="0 0 24 24"><path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z"/></symbol>
  <symbol id="icon-heart" viewBox="0 0 24 24"><path d="M12 20C0 12 3 3 9 5l3 3 3-3c6-2 9 7-3 15Z"/></symbol>
  <symbol id="icon-refresh" viewBox="0 0 24 24"><path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/></symbol>
  <symbol id="icon-down" viewBox="0 0 24 24"><path d="M12 5v14m-6-6 6 6 6-6"/></symbol>
  <symbol id="icon-close" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></symbol>
</defs></svg>); }
