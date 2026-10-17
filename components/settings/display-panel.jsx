"use client";
import {useEffect,useState} from 'react';
import {DEFAULTS,THEMES,attrs,cleanupWidgetKeys,read,write} from '../../lib/prefs.js';
import {Choices,Panel,Switch} from './controls.jsx';
// The tab labels and their order come from the same SLOTS table both bottom navs read, so this
// select cannot call the Journal "Study" while the navs call it "Journal" (SC 3.2.4).
import {SLOTS} from '../tabs/slugs.js';
const THEME_NAMES={forest:'Forest',ocean:'Ocean',plum:'Plum',clay:'Clay',ink:'Ink'};
// DEVICE-LOCAL AND SIGNED OUT ON PURPOSE. His parents read this board on phones, with no account and
// no intention of making one, and text size, dark mode and reduced motion are the settings they
// actually need. Nothing here is fetched, posted or gated; it is localStorage through lib/prefs.js,
// which is also what the blocking boot script in app/layout.jsx reads on the next load.
export default function DisplayPanel(){
 const [prefs,setPrefs]=useState(DEFAULTS);
 // First client render has to match the server's, so the stored values arrive in an effect rather
 // than from localStorage during render; the boot script has already stamped the html element, so
 // nothing flashes while this catches up.
 useEffect(()=>{setPrefs(read(localStorage));cleanupWidgetKeys(localStorage)},[]);
 // Every change previews immediately because the stylesheet reads the same six data attributes the
 // boot script writes: stamp the element, then persist. No save button, nothing to confirm.
 function update(patch){const next=write(localStorage,{...prefs,...patch});setPrefs(next);Object.assign(document.documentElement.dataset,attrs(next))}
 return <>
  <Panel eyebrow="ON THIS DEVICE" title="How Checkpoint looks" lead="These stay in this browser, so they need no account and travel with nobody. Everything previews as you tap it.">
   <div className="settings-fields">
    {[['dark','Dark mode','Easier at night. Your theme keeps its hue either way.'],['contrast','High contrast','Stronger text and borders, for bright rooms and tired eyes.'],['focus','Focus mode','Hides the hero, the trail and the side cards, leaving the day and the feed.']].map(([key,label,hint])=>
     <Switch key={key} label={label} hint={hint} on={prefs[key]} onChange={value=>update({[key]:value})}/>)}
    <Choices id="text-size" label="Text size" value={prefs.scale} onChange={scale=>update({scale})} options={[['small','Small'],['normal','Normal'],['large','Large']]} hint="Large keeps every control and target growing with it. Pinch zoom still works too."/>
   </div>
  </Panel>
  <Panel eyebrow="YOUR COLOR" title="Theme" lead="A theme is the whole board: the paper, the cards, the hairlines and the accent on the buttons. Forest is the one Pip wears. Every theme is checked for the same contrast, and dark mode and high contrast still apply on top of whichever you pick.">
   <div className="theme-list" role="radiogroup" aria-label="Theme">
    {THEMES.map(theme=><label key={theme} className="theme-option" data-theme={theme}><input type="radio" name="theme" value={theme} checked={prefs.theme===theme} onChange={()=>update({theme})}/><span className="theme-swatch" aria-hidden="true"/>{THEME_NAMES[theme]}</label>)}
   </div>
   <span className="settings-hint">Every theme is generated from one recipe and checked pair by pair, in light, dark and high contrast, before it ships.</span>
  </Panel>
  <Panel eyebrow="MOVEMENT AND PACE" title="Motion" lead="Three states rather than a switch, because “off” has to be able to mean “my phone already asks for less motion, and I am happy with that”.">
   <div className="settings-fields">
    <Choices id="motion" label="Reduced motion" value={prefs.reduceMotion} onChange={reduceMotion=>update({reduceMotion})} options={[['system','Follow my device'],['on','Always reduce'],['off','Keep motion']]} hint="Follow my device uses your phone or computer's own accessibility setting."/>
    <Choices id="clock" label="Clock" value={prefs.clock} onChange={clock=>update({clock})} options={[['12','12-hour'],['24','24-hour']]} hint="How study times read: 4 p.m. or 16:00."/>
   </div>
  </Panel>
  <Panel eyebrow="WHAT YOU SEE FIRST" title="Opening the board" lead="Where a visit lands, and how much of the day it shows at once.">
   <div className="settings-fields">
    <div className="settings-field"><label htmlFor="default-tab">Open the board on</label><select id="default-tab" value={prefs.defaultTab} onChange={event=>update({defaultTab:event.target.value})}>{SLOTS.map(([tab,label])=><option key={tab} value={tab}>{label}</option>)}</select><span className="settings-hint">A link that names its own tab still wins, so shared links keep working.</span></div>
    <Switch label="Compact feed" hint="Hides the hourly summary cards. Written posts and the day's totals stay." on={prefs.compactFeed} onChange={compactFeed=>update({compactFeed})}/>
    <Choices id="chart-measure" label="Week chart shows" value={prefs.chartMeasure} onChange={chartMeasure=>update({chartMeasure})} options={[['minutes','Minutes'],['questions','Questions']]} hint="The chart used to forget this on every visit."/>
   </div>
  </Panel>
 </>
}
