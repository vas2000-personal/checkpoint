-- Additive upgrade: preserve existing posts and their historical dates.
alter table public.checkpoint_users add column time_zone text not null default 'America/New_York';
alter table public.checkpoint_posts alter column post_day drop expression;
alter table public.checkpoint_posts add column study jsonb;
alter table public.checkpoint_posts add column source_updated_at timestamptz;
alter table public.checkpoint_posts add column received_at timestamptz;
create unique index checkpoint_study_day_idx on public.checkpoint_posts(username,post_day) where study is not null;
create table public.checkpoint_api_keys (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 username text not null references public.checkpoint_users(username) on delete cascade,
 created_at timestamptz not null default now()
);
create index checkpoint_api_keys_user_idx on public.checkpoint_api_keys(username);
create table public.checkpoint_breaks (
 username text not null references public.checkpoint_users(username) on delete cascade,
 start_day date not null, until_day date not null check(until_day >= start_day),
 primary key(username,start_day)
);
alter table public.checkpoint_api_keys enable row level security;
alter table public.checkpoint_breaks enable row level security;
revoke all on public.checkpoint_api_keys,public.checkpoint_breaks from public,anon,authenticated;
grant select,insert,delete on public.checkpoint_api_keys to service_role;
grant select,insert,update,delete on public.checkpoint_breaks to service_role;
grant update on public.checkpoint_users,public.checkpoint_posts to service_role;
-- Serialize syncs per user, preserve newer data on out-of-order delivery.
create function public.checkpoint_sync(p_username text,p_day date,p_text text,p_study jsonb,p_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.checkpoint_posts; had_day boolean; changed boolean;
begin
 perform 1 from public.checkpoint_users where username=p_username for update;
 select exists(select 1 from public.checkpoint_posts where username=p_username and post_day=p_day) into had_day;
 insert into public.checkpoint_posts(id,username,message,post_day,study,source_updated_at,received_at)
 values(gen_random_uuid(),p_username,p_text,p_day,p_study,p_updated_at,now())
 on conflict(username,post_day) where study is not null do update
 set message=excluded.message,study=excluded.study,source_updated_at=excluded.source_updated_at,received_at=now()
 where excluded.source_updated_at >= checkpoint_posts.source_updated_at
 returning * into saved;
 changed := saved.id is not null;
 if not changed then
   -- An old retry still proves the app is reachable; it cannot replace newer counts.
   update public.checkpoint_posts set received_at=now() where username=p_username and post_day=p_day and study is not null returning * into saved;
 end if;
 return jsonb_build_object('ok',true,'id',saved.id,'date',saved.post_day,'updated',changed,'xp_awarded',case when had_day then 0 else 100 end,'updated_at',saved.source_updated_at,'received_at',saved.received_at);
end $$;
revoke all on function public.checkpoint_sync(text,date,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.checkpoint_sync(text,date,text,jsonb,timestamptz) to service_role;
-- Fill dates for old clients too; new dates use the posting user's time zone.
create function public.checkpoint_post_date() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text;
begin
 select time_zone into zone from public.checkpoint_users where username=new.username for update;
 if new.post_day is null then new.post_day=(new.created_at at time zone coalesce(zone,'America/New_York'))::date;end if;
 return new;
end $$;
revoke all on function public.checkpoint_post_date() from public,anon,authenticated;
grant execute on function public.checkpoint_post_date() to service_role;
create trigger checkpoint_post_date before insert on public.checkpoint_posts for each row execute function public.checkpoint_post_date();
alter table public.checkpoint_posts alter column post_day set not null;
notify pgrst,'reload schema';
