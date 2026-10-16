"use client";
// The settings primitives. A panel is .card .profile-settings as well as .settings-panel on purpose:
// the sheet already themes that pair in light, dark, high contrast and dark+high contrast, and gives
// anything focusable inside it a surface-colored focus rim. New CSS is only ever the new control.
export function Panel({eyebrow,title,lead,children,id}){return <section className="card profile-settings settings-panel" id={id}>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3>{lead&&<p>{lead}</p>}{children}</section>}
// aria-pressed is the state; the On/Off pill is decoration, so it is hidden from the reader rather
// than read out a second time after the button's own pressed state.
export function Switch({label,hint,on,onChange,disabled}){return <button type="button" className="settings-switch" aria-pressed={!!on} disabled={disabled} onClick={()=>onChange(!on)}><span><strong>{label}</strong>{hint&&<span className="settings-hint">{hint}</span>}</span><span className="settings-switch-state" aria-hidden="true">{on?'On':'Off'}</span></button>}
export function Choices({id,label,hint,value,options,onChange,disabled}){
 return <div className="settings-field" role="group" aria-labelledby={id+'-label'}><strong className="settings-group-label" id={id+'-label'}>{label}</strong><div className="settings-choices">{options.map(([slug,text])=><button key={slug} type="button" className="settings-choice" aria-pressed={value===slug} disabled={disabled} onClick={()=>onChange(slug)}>{text}</button>)}</div>{hint&&<span className="settings-hint">{hint}</span>}</div>
}
export function Meta({rows}){return <dl className="settings-meta">{rows.map(([term,value])=><div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>}
// Pip, small, wherever a panel has nothing to show yet: an empty settings page should still feel like
// Checkpoint rather than a blank card.
export function PipNote({title,children}){return <div className="settings-empty"><img src="/assets/pip.webp" alt="" width="64" height="75" decoding="async" loading="lazy"/><div><h3>{title}</h3>{children}</div></div>}
