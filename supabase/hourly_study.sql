-- Keep the latest cumulative daily totals separate from the hourly feed snapshots.
alter table public.checkpoint_posts add column bucket_start timestamptz;
create table public.checkpoint_study_days(
 username text not null references public.checkpoint_users(username) on delete cascade,
 post_day date not null,message text not null,study jsonb not null,
 source_updated_at timestamptz not null,received_at timestamptz not null,
 primary key(username,post_day)
);
alter table public.checkpoint_study_days enable row level security;
revoke all on public.checkpoint_study_days from public,anon,authenticated;
grant select,insert,update,delete on public.checkpoint_study_days to service_role;
insert into public.checkpoint_study_days(username,post_day,message,study,source_updated_at,received_at)
select distinct on(p.username,p.post_day) p.username,p.post_day,p.message,p.study,p.source_updated_at,p.received_at
from public.checkpoint_posts p where p.study is not null order by p.username,p.post_day,p.source_updated_at desc;
-- Local minutes/seconds preserve separate offsets during a repeated DST hour.
update public.checkpoint_posts p set bucket_start=p.source_updated_at
 - extract(minute from p.source_updated_at at time zone u.time_zone)*interval '1 minute'
 - extract(second from p.source_updated_at at time zone u.time_zone)*interval '1 second'
from public.checkpoint_users u where u.username=p.username and p.study is not null;
drop index public.checkpoint_study_day_idx;
create unique index checkpoint_study_hour_idx on public.checkpoint_posts(username,post_day,bucket_start) where study is not null;
alter table public.checkpoint_posts add constraint checkpoint_study_hour_required check(study is null or bucket_start is not null);
create or replace function public.checkpoint_sync(p_username text,p_day date,p_text text,p_study jsonb,p_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.checkpoint_posts;had_day boolean;changed boolean;zone text;local_time timestamp;bucket timestamptz;normalized_day date;
begin
 select time_zone into zone from public.checkpoint_users where username=p_username for update;
 local_time:=p_updated_at at time zone zone;
 normalized_day:=p_day;
 if p_day=local_time::date and extract(hour from local_time)<4 then normalized_day:=p_day-1;end if;
 bucket:=p_updated_at-extract(minute from local_time)*interval '1 minute'-extract(second from local_time)*interval '1 second';
 select exists(select 1 from public.checkpoint_posts where username=p_username and post_day=normalized_day) into had_day;
 insert into public.checkpoint_study_days(username,post_day,message,study,source_updated_at,received_at)
 values(p_username,normalized_day,p_text,p_study,p_updated_at,now())
 on conflict(username,post_day) do update
 set message=excluded.message,study=excluded.study,source_updated_at=excluded.source_updated_at,received_at=now()
 where excluded.source_updated_at >= checkpoint_study_days.source_updated_at;
 -- A stale retry is a heartbeat, never a replacement of newer totals.
 update public.checkpoint_study_days set received_at=now() where username=p_username and post_day=normalized_day;
 insert into public.checkpoint_posts(id,username,message,post_day,study,source_updated_at,received_at,bucket_start)
 values(gen_random_uuid(),p_username,p_text,normalized_day,p_study,p_updated_at,now(),bucket)
 on conflict(username,post_day,bucket_start) where study is not null do update
 set message=excluded.message,study=excluded.study,source_updated_at=excluded.source_updated_at,received_at=now()
 where excluded.source_updated_at >= checkpoint_posts.source_updated_at returning * into saved;
 changed:=saved.id is not null;
 if not changed then
  update public.checkpoint_posts set received_at=now() where username=p_username and post_day=normalized_day and bucket_start=bucket and study is not null returning * into saved;
 end if;
 return jsonb_build_object('ok',true,'id',saved.id,'date',saved.post_day,'hour',saved.bucket_start,'updated',changed,'xp_awarded',case when had_day then 0 else 100 end,'updated_at',saved.source_updated_at,'received_at',saved.received_at);
end $$;
revoke all on function public.checkpoint_sync(text,date,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.checkpoint_sync(text,date,text,jsonb,timestamptz) to service_role;
create or replace function public.checkpoint_post_date() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text;local_time timestamp;
begin
 select time_zone into zone from public.checkpoint_users where username=new.username for update;
 local_time:=new.created_at at time zone coalesce(zone,'America/New_York');
 if new.post_day is null then new.post_day:=local_time::date;end if;
 if new.study is null and new.post_day=local_time::date and extract(hour from local_time)<4 then new.post_day:=new.post_day-1;end if;
 return new;
end $$;
revoke all on function public.checkpoint_post_date() from public,anon,authenticated;
grant execute on function public.checkpoint_post_date() to service_role;
notify pgrst,'reload schema';
