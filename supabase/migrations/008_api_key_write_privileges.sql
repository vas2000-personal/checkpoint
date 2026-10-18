begin;
-- MAKE THE INVARIANT 007 CLAIMS ACTUALLY TRUE.
--
-- 007 says, in its header and in components/settings/miss-log-panel.jsx, that the Next server "has no
-- insert or delete on checkpoint_api_keys, only execute on three functions that take one username".
-- That was true of what 007 GRANTED, and false of the live database. Checking the real grants after
-- applying it turned up:
--
--   service_role = DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
--
-- Those predate 007 -- Supabase grants service_role full table privileges on creation, and
-- checkpoint_api_keys was made before supabase/migrations/ existed, so nothing in this directory ever
-- described them. The definer functions were therefore a politeness rather than a boundary: the
-- server could still have emptied the table with one DELETE of its own choosing.
--
-- Revoking is safe because nothing writes this table directly. The only two readers are
-- app/api/checkpoint/route.js (select username by token_hash) and app/api/settings/route.js (select
-- created_at, token_hash by username); every write goes through checkpoint_issue_key,
-- checkpoint_revoke_key or checkpoint_revoke_keys, which run as their owner and do not need the
-- caller to hold the privilege they use.
--
-- postgres keeps everything, so the by-hand path through the Supabase SQL editor is unaffected.
--
-- To undo: grant insert,delete,update,truncate,references,trigger on public.checkpoint_api_keys to
-- service_role;
revoke insert,update,delete,truncate,references,trigger on public.checkpoint_api_keys from service_role;
grant select on public.checkpoint_api_keys to service_role;
-- The same audit question, asked of the other table holding a credential: sessions are written by
-- /api/enter, /api/signup and /api/signout, so service_role legitimately needs insert and delete
-- there. Stated here so the difference between the two tables is a decision on the record rather
-- than an accident of which one happened to be created first.
notify pgrst,'reload schema';
commit;
