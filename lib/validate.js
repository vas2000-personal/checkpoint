import {bad} from './errors.js';
export function validatePost(body,username){
  if(!body||typeof body!=='object')throw bad('Please write an update.',400);
  if(typeof body.username!=='string'||body.username.trim().toLowerCase()!==username)throw bad('That username is not the posting username for this board.',403);
  const message=typeof body.message==='string'?body.message.trim():'';
  if(!message||message.length>2000)throw bad('Write an update between 1 and 2,000 characters.',400);
  if(typeof body.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id))throw bad('Please refresh and try posting again.',400);
  return {id:body.id,username,message};
}
export function validateUsername(value) {
  const username=typeof value==='string'?value.trim().toLowerCase():'';
  if(!/^[a-z0-9_]{2,24}$/.test(username))throw bad('Use 2–24 letters, numbers, or underscores for your username.',400);
  return username;
}
