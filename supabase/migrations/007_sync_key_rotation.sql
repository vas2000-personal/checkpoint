begin;
-- ISSUING AND REVOKING MISS LOG SYNC KEYS, FROM SETTINGS INSTEAD OF FROM psql.
--
-- Before this, 006 granted the Next server `select` on checkpoint_api_keys and nothing else, so the
-- owner could be told a key existed but had to open the database by hand to make or remove one --
-- which is exactly what components/settings/miss-log-panel.jsx wrote out, step by step, under
-- "Revoking this key". These three functions replace that paragraph with buttons.
--
-- ISSUING NEVER TOUCHES THE KEY MISS LOG IS ALREADY USING. The obvious shape -- delete the old row,
-- insert the new one -- breaks the live connection the moment the owner presses the button, and
-- leaves it broken until he gets to the other machine and pastes the new key in. A new key is an
-- ADDITIONAL key: both work, he moves Miss Log over whenever he likes, confirms the sync landed, and
-- revokes the old one himself. That ordering is the whole reason revoke is a separate function.
-- The table's primary key is already token_hash, so holding several was always possible; nothing in
-- the schema had to change for it, only what the server is allowed to ask for.
--
-- SECURITY DEFINER FUNCTIONS, NOT TABLE GRANTS, and that is the point: the server still has no
-- `insert` or `delete` on checkpoint_api_keys. It can call exactly these operations, on exactly one
-- username, and cannot write any other row or column by any other shape of query. checkpoint_sync
-- and checkpoint_awake are already shaped this way; this follows them.
--
-- The server sends a HASH. The key itself is generated in the route, shown to the owner once and
-- never stored, so a dump of this table still cannot post as anybody -- the same property the
-- session table has. The regex check on token_hash stays in force because these write through the
-- table rather than around it.

-- Each failure gets its OWN SQLSTATE (CP001 full, CP002 no such user, CP003 malformed): lib/db.js
-- carries the code and not the message, so two failures that need different answers on screen cannot
-- be told apart unless they are told apart here.
--
-- A ceiling, not a replacement. Keys accumulate only by being issued and never revoked, and six live
-- keys means something is wrong -- a loop, or a forgotten machine. The error is the owner's cue to
-- revoke one, which is a decision he has the screen for, rather than the server silently dropping
-- whichever key it guessed was stale.
create or replace function public.checkpoint_issue_key(p_username text, p_token_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_created timestamptz; v_live integer;
begin
  if p_username is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key' using errcode='CP003';
  end if;
  -- The foreign key already refuses a username with no profile; this turns that into the same error
  -- the route reports for a missing person rather than a constraint violation in the log.
  if not exists(select 1 from public.checkpoint_users u where u.username=p_username) then
    raise exception 'no such user' using errcode='CP002';
  end if;
  select count(*) into v_live from public.checkpoint_api_keys k where k.username=p_username;
  if v_live>=5 then
    raise exception 'too many keys' using errcode='CP001';
  end if;
  insert into public.checkpoint_api_keys(username,token_hash) values(p_username,p_token_hash)
  returning created_at into v_created;
  return v_created;
end $$;

-- Revoke ONE key, named by a prefix of its hash -- the only handle the settings page can show,
-- because the key itself was never stored. The prefix must select exactly one of the caller's own
-- rows: an ambiguous prefix revokes nothing rather than guessing, and a prefix belonging to somebody
-- else's key matches nothing because the username is in the predicate either way.
create or replace function public.checkpoint_revoke_key(p_username text, p_prefix text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_username is null or p_prefix !~ '^[0-9a-f]{8,64}$' then
    raise exception 'invalid key id' using errcode='CP003';
  end if;
  select count(*) into v_count from public.checkpoint_api_keys k
   where k.username=p_username and k.token_hash like p_prefix||'%';
  if v_count<>1 then return 0; end if;
  delete from public.checkpoint_api_keys k
   where k.username=p_username and k.token_hash like p_prefix||'%';
  return 1;
end $$;

-- "Disconnect Miss Log entirely", which is a different intention from rotating and deserves its own
-- button: it is the one to press when a machine is lost rather than replaced.
create or replace function public.checkpoint_revoke_keys(p_username text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_username is null then raise exception 'invalid user' using errcode='CP003'; end if;
  with gone as (delete from public.checkpoint_api_keys k where k.username=p_username returning 1)
  select count(*) into v_count from gone;
  return v_count;
end $$;

-- A definer function runs as its owner, so PUBLIC must not be able to call one that mints a key.
revoke all on function public.checkpoint_issue_key(text,text) from public,anon,authenticated;
revoke all on function public.checkpoint_revoke_key(text,text) from public,anon,authenticated;
revoke all on function public.checkpoint_revoke_keys(text) from public,anon,authenticated;
grant execute on function public.checkpoint_issue_key(text,text) to service_role;
grant execute on function public.checkpoint_revoke_key(text,text) to service_role;
grant execute on function public.checkpoint_revoke_keys(text) to service_role;
-- Restated from 006 so a database built only from migrations/ still lets the settings page read which
-- keys exist and when they were made. Deliberately NOT insert/delete: the functions above are the way.
grant select on public.checkpoint_api_keys to service_role;
notify pgrst,'reload schema';
commit;
