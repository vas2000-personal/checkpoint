import {bad} from './errors.js';
export function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const username = (process.env.CHECKPOINT_USERNAME || 'brother').trim().toLowerCase();
  if (!url || !key) throw bad('Checkpoint is waiting for its Supabase connection.',503);
  if (!/^[a-z0-9_]{2,24}$/.test(username)) throw bad('The posting username needs 2–24 letters, numbers, or underscores.',503);
  const origin = new URL(url);
  if(origin.protocol!=='https:') throw bad('The database connection must use HTTPS.',503);
  return {url:origin.origin, key, username, displayName:process.env.CHECKPOINT_DISPLAY_NAME || 'My brother'};
}
