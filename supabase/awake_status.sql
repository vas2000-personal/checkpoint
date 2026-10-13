-- Additive: the first moment Miss Log saw activity each study day. Times only, no XP, no feed card.
create table if not exists public.checkpoint_awake(
 username text not null references public.checkpoint_users(username) on delete cascade,
 post_day date not null,awake_at timestamptz not null,still_up boolean not null default false,
 last_active_at timestamptz,received_at timestamptz not null default now(),
 primary key(username,post_day),
 check(last_active_at is null or last_active_at >= awake_at)
);
alter table public.checkpoint_awake enable row level security;
revoke all on public.checkpoint_awake from public,anon,authenticated;
grant select,insert,update,delete on public.checkpoint_awake to service_role;
-- Retries and out-of-order requests only move awake_at earlier and last_active_at later.
create or replace function public.checkpoint_awake(p_username text,p_day date,p_awake_at timestamptz,p_still_up boolean,p_last_active_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.checkpoint_awake;
begin
 insert into public.checkpoint_awake(username,post_day,awake_at,still_up,last_active_at,received_at)
 values(p_username,p_day,p_awake_at,coalesce(p_still_up,false),p_last_active_at,now())
 on conflict(username,post_day) do update
 set awake_at=least(checkpoint_awake.awake_at,excluded.awake_at),
  -- still_up belongs to whichever request carried the earliest awake_at.
  still_up=case when excluded.awake_at<checkpoint_awake.awake_at then excluded.still_up else checkpoint_awake.still_up end,
  last_active_at=greatest(checkpoint_awake.last_active_at,excluded.last_active_at),received_at=now()
 returning * into saved;
 return jsonb_build_object('ok',true,'date',saved.post_day,'awake_at',saved.awake_at,'still_up',saved.still_up,'last_active_at',saved.last_active_at);
end $$;
revoke all on function public.checkpoint_awake(text,date,timestamptz,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.checkpoint_awake(text,date,timestamptz,boolean,timestamptz) to service_role;
notify pgrst,'reload schema';
