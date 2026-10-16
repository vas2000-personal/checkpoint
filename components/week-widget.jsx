"use client";
import {Icon} from './icons.jsx';
import {StudyWeek} from './study.jsx';
export default function WeekWidget({board,stats,today,measure}){
 const week=today?Array.from({length:7},(_,index)=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-(6-index));const key=date.toISOString().slice(0,10);return {key,today:index===6,checked:stats.days.includes(key),number:date.getUTCDate(),label:date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}).slice(0,1)}}):[];
 return <section className="card week"><div className="card-heading"><div><span className="eyebrow">THE LAST SEVEN DAYS</span><h3>A week of showing up</h3></div></div><div id="week-grid">{week.map(day => <div key={day.key} className={`day${day.today ? " today" : ""}${day.checked ? " checked" : ""}`} title={`${day.key}: ${day.checked ? "Posted an update" : "No update"}`}>{day.label}<b>{day.checked ? <Icon name="check" /> : day.number}</b></div>)}</div><p id="week-summary">{board ? `${week.filter(day => day.checked).length} of 7 days. The little things are adding up.` : "—"}</p><StudyWeek weekly={board?.weekly} measure={measure}/></section>;
}
