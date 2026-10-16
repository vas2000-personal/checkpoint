-- Additive. Two cheap server-side jobs the board was doing badly over HTTP, plus the one grant a
-- self-healing signup needs. Nothing here is required: lib/ falls back when PostgREST answers 404.
begin;
-- 1. Streak, XP count and postedToday without shipping the whole posting history to Vercel.
-- Same rule as lib/server.js statsForDays: walk back from today (or yesterday, when today is not
-- posted) and stop at the first gap that no break covers.
create or replace function public.checkpoint_stats(p_username text,p_today date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare days date[];earliest date;d date;streak integer:=0;posted boolean;
begin
 select array_agg(post_day order by post_day) into days from (select distinct post_day from public.checkpoint_posts where username=p_username) s;
 if days is null then return jsonb_build_object('days',array[]::date[],'streak',0,'posted_today',false);end if;
 earliest:=days[1];posted:=p_today=any(days);
 d:=case when posted then p_today else p_today-1 end;
 while d>=earliest loop
  if d=any(days) then streak:=streak+1;
  elsif not exists(select 1 from public.checkpoint_breaks b where b.username=p_username and b.start_day<=d and b.until_day>=d) then exit;
  end if;
  d:=d-1;
 end loop;
 return jsonb_build_object('days',days,'streak',streak,'posted_today',posted);
end $$;
revoke all on function public.checkpoint_stats(text,date) from public,anon,authenticated;
grant execute on function public.checkpoint_stats(text,date) to service_role;
-- 2. Rate limiting. Vercel functions share no memory, so the counter has to be durable; one fixed
-- window per key, swept as it rolls, so the table never holds more than the live windows.
create table if not exists public.checkpoint_attempts(
 bucket_key text not null,
 window_start timestamptz not null,
 attempts integer not null default 0,
 primary key(bucket_key,window_start)
);
create index if not exists checkpoint_attempts_window_idx on public.checkpoint_attempts (window_start);
alter table public.checkpoint_attempts enable row level security;
revoke all on public.checkpoint_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.checkpoint_attempts to service_role;
create or replace function public.checkpoint_attempt(p_key text,p_limit integer,p_window_seconds integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w timestamptz;n integer;
begin
 w:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
 insert into public.checkpoint_attempts(bucket_key,window_start,attempts) values(p_key,w,1)
 on conflict(bucket_key,window_start) do update set attempts=checkpoint_attempts.attempts+1
 returning attempts into n;
 delete from public.checkpoint_attempts where window_start<w-interval '1 hour';
 return jsonb_build_object('allowed',n<=p_limit,'retry_after',greatest(1,ceil(extract(epoch from (w+make_interval(secs=>p_window_seconds))-now()))::integer));
end $$;
revoke all on function public.checkpoint_attempt(text,integer,integer) from public,anon,authenticated;
grant execute on function public.checkpoint_attempt(text,integer,integer) to service_role;
-- 3. /api/signup deletes the user row it just created when the session insert fails, so a retry is
-- not met with "already taken".
grant delete on public.checkpoint_users to service_role;
notify pgrst,'reload schema';
commit;
