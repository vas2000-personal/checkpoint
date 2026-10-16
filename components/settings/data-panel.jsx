"use client";
import {useState} from 'react';
import {Panel,Switch} from './controls.jsx';
// Plain anchors, not fetch: GET /api/export already answers with Content-Disposition and streams its
// pages, so the browser's own download is the whole feature. The awake opt-in is a query parameter
// per request and is deliberately never remembered — see the comment at the top of that route.
export default function DataPanel({username}){
 const [awake,setAwake]=useState(false);
 const href=format=>'/api/export?format='+format+(awake?'&awake=1':'');
 return <Panel eyebrow="EVERYTHING YOU HAVE WRITTEN" title="Download your data" lead="Your posts, your study days, your breaks and the days you checked in — the whole history, in one file, for you.">
  <div className="settings-actions">
   <a className="settings-save" href={href('json')} download>Download JSON</a>
   <a className="settings-save" href={href('csv')} download>Download CSV</a>
  </div>
  <small>JSON keeps the nesting; CSV opens in a spreadsheet, one section per table.</small>
  <div className="settings-fields">
   <Switch label="Include my awake times" hint="Off by default, and asked again every time. A file gets mailed and pasted and synced; these two columns say when you were asleep and when you stopped touching the keyboard." on={awake} onChange={setAwake}/>
  </div>
  <p className="settings-hint">The file is named checkpoint-{username}-&lt;today&gt;. Only your own rows are in it: the export reads the signed-in session and never a username in the link.</p>
 </Panel>
}
