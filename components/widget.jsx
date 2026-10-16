"use client";
import RememberedDetails from './remembered-details.jsx';
// storageKey is the title, so these strings are the localStorage keys behind "remember expanded
// widgets": editing one resets every visitor's open/closed state for that card.
function Widget({title,summary,children}){return <RememberedDetails storageKey={title} className="compact-widget"><summary><span><strong>{title}</strong><small>{summary}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div className="widget-content">{children}</div></RememberedDetails>}
export default Widget;
