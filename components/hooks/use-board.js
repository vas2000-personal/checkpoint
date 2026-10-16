"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,mergePosts} from '../../lib/client.js';
// modalRef is the entry dialog: a background refresh while it is open would yank the board out from
// under someone mid sign-in, so the poll deliberately skips those ticks.
export default function useBoard(initialBoard,modalRef){
  const [board,setBoard]=useState(initialBoard),[user,setUser]=useState(initialBoard?.currentUser?.username||''),[selected,setSelected]=useState(initialBoard?.selectedUsername||'');
  const [loading,setLoading]=useState(false),[loadError,setLoadError]=useState('');
  const busy=useRef(false),cursor=useRef(initialBoard?.next||null),selectedUser=useRef(''),token=useRef(0),pages=useRef(initialBoard?1:0),feedKey=useRef(initialBoard?initialBoard.selectedUsername||'':null);
  // A user-initiated load supersedes an in-flight background poll instead of being dropped by the guard;
  // whichever request is no longer the newest walks away without touching state.
  const load=useCallback(async(more=false,userAction=false)=>{
    if(busy.current&&!userAction)return;
    const mine=++token.current;busy.current=true;setLoading(true);
    try {
      const query=new URLSearchParams();if(more&&cursor.current)query.set('before',cursor.current);if(selectedUser.current)query.set('user',selectedUser.current);
      const result=await api('/api/board'+(query.size?'?'+query:''));
      if(mine!==token.current)return;
      // A refresh re-reads page 1 only, so it must keep the pages already read and leave their cursor alone.
      const fresh=!more&&(pages.current===0||feedKey.current!==selectedUser.current);
      if(more)pages.current+=1;else if(fresh)pages.current=1;
      if(more||fresh||pages.current===1)cursor.current=result.next;
      feedKey.current=selectedUser.current;
      setUser(result.currentUser?.username||'');setSelected(result.selectedUsername||'');
      setBoard(previous=>({...result,next:cursor.current,posts:mergePosts(fresh?[]:previous?.posts||[],result.posts,more)}));
      setLoadError('');
    }
    catch(error){if(mine===token.current)setLoadError(error.message)}
    finally{if(mine===token.current){busy.current=false;setLoading(false)}}
  },[]);
  useEffect(()=>{if(!initialBoard)load()},[load,initialBoard]);
  useEffect(()=>{const refresh=()=>{if(!document.hidden&&!modalRef.current?.open)load()};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh)}},[load]);
  return {board,user,setUser,selected,setSelected,loading,loadError,load,selectedUser};
}
