begin;
-- Additive: an opt-in passphrase for a username that is already sharing progress. No row means the
-- account still enters by username alone, exactly as before, and nobody is enrolled automatically.
create table if not exists public.checkpoint_credentials(
 username text primary key references public.checkpoint_users(username) on delete cascade,
 -- The CHECK pins the SHAPE of lib/passphrase.js's scrypt string, not its cost: rotating N, r or p
 -- stays legal, but switching to another algorithm needs this constraint relaxed first.
 secret text not null check(secret ~ '^scrypt\$[0-9]{1,7}\$[0-9]{1,3}\$[0-9]{1,3}\$[0-9a-f]{32}\$[0-9a-f]{128}$'),
 recovery_hash text check(recovery_hash ~ '^[0-9a-f]{64}$'),
 -- TWO independent meters, one per factor, and that separation is load-bearing. With one shared
 -- counter a stranger who only knows the public username could burn wrong RECOVERY codes to grow the
 -- lock that gates the PASSPHRASE, and the real owner's correct passphrase then answered 429 for
 -- fifteen minutes, sustainable for ever at the 10-per-minute limit. Each lock now gates only the
 -- factor that earned it.
 failed_attempts integer not null default 0 check(failed_attempts>=0),
 locked_until timestamptz,
 -- Escalation level, NOT the strike count, is what sizes a lock, and only a correct attempt clears
 -- it. failed_attempts has to decay when a spent lock is seen or the owner's next single typo relocks
 -- instantly at the cap; while the lock was sized from that decayed count the backoff could never
 -- grow past the first 60 seconds, so a sustained attacker was never charged more than the first step.
 lock_level integer not null default 0 check(lock_level>=0),
 recovery_failed_attempts integer not null default 0 check(recovery_failed_attempts>=0),
 recovery_locked_until timestamptz,
 recovery_lock_level integer not null default 0 check(recovery_lock_level>=0),
 -- Audit only, NOT load-bearing. It once granted "seniority": a session older than this row could
 -- change or clear the passphrase without knowing it. That was removed, because usernames are public,
 -- so anyone may hold a 180-day cookie for a name they do not own, and that cookie would then be a
 -- permanent master key over every future enrollment of it. Changing or clearing the passphrase now
 -- needs the current passphrase or the recovery code, and nothing reads this column to decide.
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
-- The four columns above arrived after the table did, so an existing database gets them here.
alter table public.checkpoint_credentials add column if not exists lock_level integer not null default 0;
alter table public.checkpoint_credentials add column if not exists recovery_failed_attempts integer not null default 0;
alter table public.checkpoint_credentials add column if not exists recovery_locked_until timestamptz;
alter table public.checkpoint_credentials add column if not exists recovery_lock_level integer not null default 0;
alter table public.checkpoint_credentials enable row level security;
revoke all on public.checkpoint_credentials from public,anon,authenticated;
-- Delete: the recovery path drops the row, returning the account to username-only entry.
grant select,insert,update,delete on public.checkpoint_credentials to service_role;
-- One update statement per factor, so two concurrent guesses cannot both read 0 and both write 1.
-- The backoff is capped at 15 minutes on purpose: a permanent lock would turn any username someone
-- knows into a denial-of-service switch against its owner.
-- A lock is armed only when nothing is armed already (locked_until is null). A burst of parallel
-- guesses all read null from their own SELECT, so without that guard each one past the fifth would
-- step the level again and a single burst would jump straight to the 15-minute cap.
drop function if exists public.checkpoint_passphrase_result(text,boolean);
create or replace function public.checkpoint_passphrase_result(p_username text,p_ok boolean,p_factor text default 'passphrase')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.checkpoint_credentials;
begin
 if p_factor='recovery' then
  update public.checkpoint_credentials set
   recovery_failed_attempts=case when p_ok then 0
    when recovery_locked_until is not null and recovery_locked_until<=now() then 1
    else recovery_failed_attempts+1 end,
   recovery_lock_level=case when p_ok then 0
    when recovery_locked_until is null and recovery_failed_attempts+1>=5 then recovery_lock_level+1
    else recovery_lock_level end,
   recovery_locked_until=case when p_ok then null
    when recovery_locked_until is null and recovery_failed_attempts+1>=5 then now()+make_interval(secs=>least(900,60*power(2,recovery_lock_level)))
    when recovery_locked_until<=now() then null
    else recovery_locked_until end,
   updated_at=now()
  where username=p_username returning * into saved;
 else
  update public.checkpoint_credentials set
   failed_attempts=case when p_ok then 0
    when locked_until is not null and locked_until<=now() then 1
    else failed_attempts+1 end,
   lock_level=case when p_ok then 0
    when locked_until is null and failed_attempts+1>=5 then lock_level+1
    else lock_level end,
   locked_until=case when p_ok then null
    when locked_until is null and failed_attempts+1>=5 then now()+make_interval(secs=>least(900,60*power(2,lock_level)))
    when locked_until<=now() then null
    else locked_until end,
   updated_at=now()
  where username=p_username returning * into saved;
 end if;
 if saved.username is null then return jsonb_build_object('ok',p_ok,'factor',p_factor,'failed_attempts',0,'locked_until',null,'recovery_failed_attempts',0,'recovery_locked_until',null);end if;
 return jsonb_build_object('ok',p_ok,'factor',p_factor,'failed_attempts',saved.failed_attempts,'locked_until',saved.locked_until,'lock_level',saved.lock_level,'recovery_failed_attempts',saved.recovery_failed_attempts,'recovery_locked_until',saved.recovery_locked_until,'recovery_lock_level',saved.recovery_lock_level);
end $$;
revoke all on function public.checkpoint_passphrase_result(text,boolean,text) from public,anon,authenticated;
grant execute on function public.checkpoint_passphrase_result(text,boolean,text) to service_role;
-- Operator escape hatch, and the ONLY way back for an owner who has lost both the passphrase and the
-- recovery code. It returns the account to username-only entry and grants no access by itself.
-- delete from public.checkpoint_credentials where username='gir';
notify pgrst,'reload schema';
commit;
