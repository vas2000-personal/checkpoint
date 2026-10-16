"use client";
import {Fragment,useImperativeHandle,useRef,useState} from 'react';
import {Icon} from './icons.jsx';
import {StudyLine,HourLabel} from './study.jsx';
import {clock} from '../lib/study.js';
import {api,feedPosts} from '../lib/client.js';
export function dayLabel(day,today) {
  const date = new Date(day+'T12:00:00Z'),yesterday=new Date(today+'T12:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const prefix=day===today?'Today':day===yesterday.toISOString().slice(0,10)?'Yesterday':date.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
  return `${prefix} · ${date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}`;
}
// The draft stays here, so the board reaches in through a ref to clear it on sign-out and to focus it
// after sign-in; requestId lives beside it because both of its resets belong to the same key. The
// composer is Today's, not the Journal's: it is the one control on the board that writes.
export function Composer({ref,board,user,stats,load,notify}){
  const [message,setMessage]=useState(''),[posting,setPosting]=useState(false),[postError,setPostError]=useState('');
  const messageRef=useRef(null),requestId=useRef(null);
  // revealMessage is focusMessage WITHOUT raising the keyboard: below 760px the board tabs stand down
  // while the textarea has focus (33-board-tabs.css) and .header-settings is already hidden, so an
  // auto-focus straight after sign-in left a phone with no navigation at all. See dashboard.jsx.
  useImperativeHandle(ref,()=>({clearMessage:()=>setMessage(''),focusMessage:()=>messageRef.current?.focus(),revealMessage:()=>messageRef.current?.scrollIntoView({block:'center',behavior:'smooth'})}),[]);
  function addPrompt(prompt){setMessage(previous=>previous.trim()?previous+'\n\n'+prompt:prompt);requestId.current=null;messageRef.current?.focus()}
  async function submitPost(event){event.preventDefault();if(!message.trim()||!user)return;setPosting(true);setPostError('');requestId.current ||= crypto.randomUUID();try{await api('/api/posts',{username:user,message:message.trim(),id:requestId.current});setMessage('');requestId.current=null;notify('Checkpoint saved. A little further today.');await load(false,true)}catch(error){setPostError(error.message)}finally{setPosting(false)}}
  return <section id="composer" className="card composer" hidden={!user || (board && board.selectedUsername !== user)}>
      <div className="card-heading"><div><span className="eyebrow">YOUR DAILY SAVE POINT</span><h2>What moved forward today?</h2></div><svg className="heading-icon"><use href="#icon-edit"/></svg></div>
      <form id="post-form" onSubmit={submitPost}><label className="sr-only" htmlFor="message">What did you work on today?</label><textarea ref={messageRef} value={message} onChange={event => {setMessage(event.target.value); requestId.current = null;}} id="message" maxLength="2000" required placeholder="Hey, today I worked on…"></textarea><div className="writing-prompts"><span>A place to start:</span><button type="button" data-prompt="Today I worked on " onClick={() => addPrompt("Today I worked on ")}>Worked on…</button><button type="button" data-prompt="A small win today was " onClick={() => addPrompt("A small win today was ")}>A small win…</button><button type="button" data-prompt="Today I learned " onClick={() => addPrompt("Today I learned ")}>Learned…</button></div><div className="compose-footer"><span id="post-hint">{stats.postedToday ? "Day saved. Another update is always welcome." : "First update of the day? That’s 100 XP."}</span><button className="primary" id="post-button" disabled={posting}>{posting ? "Saving your checkpoint…" : <>Save my checkpoint <Icon name="arrow" /></>}</button></div><p id="post-error" role="alert">{postError}</p></form>
    </section>;
}
// Both tabs print posts from the SAME board payload — Today filters it to today, the Journal shows all
// of it — so the markup lives here once. `placeholder` is off while the board-level error is on, so a
// failed refresh does not read as "still loading" underneath it.
// compactFeed and clockPref are lib/prefs.js preferences: the filter and the formatter both belong
// here because this is the one list Today and the Journal share, so neither can drift from the other.
export function PostList({posts,board,today,timeZone,empty,placeholder=true,compactFeed=false,clockPref='12'}){
  posts=feedPosts(posts,compactFeed);
  return <>{!board ? (placeholder ? <div className="empty loading">Gathering the latest chapters…</div> : null) : posts.length ? posts.map((post,index) => <Fragment key={post.id}>
  {(index === 0 || posts[index-1].post_day !== post.post_day) && <div className="post-day-label"><span className="day-dot" />{dayLabel(post.post_day,today)}{post.post_day === today && <span className="today-tag">DAY SAVED</span>}</div>}
  <article className={`post${index === 0 ? " latest" : ""}`}><div className="post-head"><span className="post-avatar">{board.displayName[0].toUpperCase()}</span><div><strong>{board.displayName}</strong><time dateTime={post.created_at}>{clock(post.created_at,timeZone,true,clockPref)} · @{post.username}</time></div>{index === 0 && <span className="post-status"><Icon name="check" />Latest checkpoint</span>}</div><HourLabel post={post} timeZone={timeZone} clockPref={clockPref}/><p>{post.message}</p><StudyLine post={post} timeZone={timeZone} today={today}/><div className="post-footer"><Icon name="flag" />A little further than yesterday.</div></article>
</Fragment>) : <div className="empty">{empty}</div>}</>;
}
