"use client";
import {Fragment,useImperativeHandle,useRef,useState} from 'react';
import {Icon} from './icons.jsx';
import {StudyLine,HourLabel} from './study.jsx';
import {clock} from '../lib/study.js';
import {api} from '../lib/client.js';
function dayLabel(day,today) {
  const date = new Date(day+'T12:00:00Z'),yesterday=new Date(today+'T12:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const prefix=day===today?'Today':day===yesterday.toISOString().slice(0,10)?'Yesterday':date.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
  return `${prefix} · ${date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}`;
}
// The draft stays here, so the board reaches in through a ref to clear it on sign-out and to focus it
// after sign-in; requestId lives beside it because both of its resets belong to the same key.
export default function Feed({ref,board,user,today,timeZone,stats,loading,loadError,load,selected,setSelected,selectedUser,notify}){
  const [message,setMessage]=useState(''),[posting,setPosting]=useState(false),[postError,setPostError]=useState(''),[filter,setFilter]=useState('all');
  const messageRef=useRef(null),requestId=useRef(null);
  useImperativeHandle(ref,()=>({clearMessage:()=>setMessage(''),focusMessage:()=>messageRef.current?.focus()}),[]);
  function addPrompt(prompt){setMessage(previous=>previous.trim()?previous+'\n\n'+prompt:prompt);requestId.current=null;messageRef.current?.focus()}
  async function submitPost(event){event.preventDefault();if(!message.trim()||!user)return;setPosting(true);setPostError('');requestId.current ||= crypto.randomUUID();try{await api('/api/posts',{username:user,message:message.trim(),id:requestId.current});setMessage('');requestId.current=null;notify('Checkpoint saved. A little further today.');await load(false,true)}catch(error){setPostError(error.message)}finally{setPosting(false)}}
  const shown=(board?.posts||[]).filter(post=>filter==='all'||post.post_day===today).sort((a,b)=>b.post_day.localeCompare(a.post_day)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  return <>
    <section id="composer" className="card composer" hidden={!user || (board && board.selectedUsername !== user)}>
      <div className="card-heading"><div><span className="eyebrow">YOUR DAILY SAVE POINT</span><h2>What moved forward today?</h2></div><svg className="heading-icon"><use href="#icon-edit"/></svg></div>
      <form id="post-form" onSubmit={submitPost}><label className="sr-only" htmlFor="message">What did you work on today?</label><textarea ref={messageRef} value={message} onChange={event => {setMessage(event.target.value); requestId.current = null;}} id="message" maxLength="2000" required placeholder="Hey, today I worked on…"></textarea><div className="writing-prompts"><span>A place to start:</span><button type="button" data-prompt="Today I worked on " onClick={() => addPrompt("Today I worked on ")}>Worked on…</button><button type="button" data-prompt="A small win today was " onClick={() => addPrompt("A small win today was ")}>A small win…</button><button type="button" data-prompt="Today I learned " onClick={() => addPrompt("Today I learned ")}>Learned…</button></div><div className="compose-footer"><span id="post-hint">{stats.postedToday ? "Day saved. Another update is always welcome." : "First update of the day? That’s 100 XP."}</span><button className="primary" id="post-button" disabled={posting}>{posting ? "Saving your checkpoint…" : <>Save my checkpoint <Icon name="arrow" /></>}</button></div><p id="post-error" role="alert">{postError}</p></form>
    </section>
    <div className="profile-selector"><label htmlFor="view-user">Following</label><select id="view-user" value={selected || board?.selectedUsername || ""} onChange={event => {setSelected(event.target.value);selectedUser.current=event.target.value;load(false,true);}}><option value="" disabled>Choose a user</option>{(board?.users||[]).map(profile => <option key={profile.username} value={profile.username}>{profile.display_name} (@{profile.username})</option>)}</select></div><div className="feed-heading"><div><div className="eyebrow">ONE UPDATE AT A TIME</div><h2 id="feed-title">The latest chapters<span>.</span></h2></div><div className="filter-tabs" role="group" aria-label="Filter updates"><button type="button" data-filter="all" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All updates</button><button type="button" data-filter="today" className={filter === "today" ? "active" : ""} aria-pressed={filter === "today"} onClick={() => setFilter("today")}>Today</button></div></div>
    <section className="feed" aria-label="Daily updates">
{/* Kept outside the !board branch so a refresh that fails over already-loaded data is still visible. */}
{loadError && <><div className="empty" role="alert">{loadError}</div><button id="retry" onClick={() => load(false,true)}>Try again <Icon name="refresh" /></button></>}
<div id="posts">
{!board ? (loadError ? null : <div className="empty loading">Gathering the latest chapters…</div>) : shown.length ? shown.map((post,index) => <Fragment key={post.id}>
  {(index === 0 || shown[index-1].post_day !== post.post_day) && <div className="post-day-label"><span className="day-dot" />{dayLabel(post.post_day,today)}{post.post_day === today && <span className="today-tag">DAY SAVED</span>}</div>}
  <article className={`post${index === 0 ? " latest" : ""}`}><div className="post-head"><span className="post-avatar">{board.displayName[0].toUpperCase()}</span><div><strong>{board.displayName}</strong><time dateTime={post.created_at}>{clock(post.created_at,timeZone,true)} · @{post.username}</time></div>{index === 0 && <span className="post-status"><Icon name="check" />Latest checkpoint</span>}</div><HourLabel post={post} timeZone={timeZone}/><p>{post.message}</p><StudyLine post={post} timeZone={timeZone} today={today}/><div className="post-footer"><Icon name="flag" />A little further than yesterday.</div></article>
</Fragment>) : <div className="empty">{filter === "today" ? "No update today yet. A fresh checkpoint is waiting." : "The first chapter starts here. Updates will appear as they are posted."}</div>}
</div><button id="more" className="load-more" hidden={!board?.next} disabled={loading} onClick={() => load(true,true)}>Earlier chapters <Icon name="down" /></button></section>
    <div className="feed-note"><svg><use href="#icon-star"/></svg> Progress over perfection. Always.</div>
  </>;
}
