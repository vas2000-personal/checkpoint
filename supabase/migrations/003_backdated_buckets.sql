-- Additive: backdated study syncs no longer mint an hourly feed card stamped with today's hour.
-- MISS_LOG_API.md documents historical corrections (an explicit older `date` with a current
-- `updated_at`). checkpoint_sync derived the hourly bucket from p_updated_at alone, so a correction
-- for an earlier day landed on a bucket_start outside that day, missed the (username,post_day,
-- bucket_start) unique index, and inserted a brand-new card for every correction.
-- A correction is not an hour of work, so it now updates the day's cumulative totals and writes no
-- hourly card at all. Clamping it into the corrected day was the other option and was rejected:
-- every slot inside that day is a real hour Miss Log could already have filled, so the correction
-- would overwrite a genuine card's message and totals.
begin;
create or replace function public.checkpoint_sync(p_username text,p_day date,p_text text,p_study jsonb,p_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.checkpoint_posts;had_day boolean;changed boolean;zone text;local_time timestamp;bucket timestamptz;normalized_day date;backdated boolean;daily public.checkpoint_study_days;
begin
 select time_zone into zone from public.checkpoint_users where username=p_username for update;
 local_time:=p_updated_at at time zone zone;
 normalized_day:=p_day;
 if p_day=local_time::date and extract(hour from local_time)<4 then normalized_day:=p_day-1;end if;
 bucket:=p_updated_at-extract(minute from local_time)*interval '1 minute'-extract(second from local_time)*interval '1 second';
 -- True when the caller is correcting an earlier day rather than reporting the hour it is in now.
 backdated:=normalized_day<>(case when extract(hour from local_time)<4 then local_time::date-1 else local_time::date end);
 select exists(select 1 from public.checkpoint_posts where username=p_username and post_day=normalized_day) into had_day;
 insert into public.checkpoint_study_days(username,post_day,message,study,source_updated_at,received_at)
 values(p_username,normalized_day,p_text,p_study,p_updated_at,now())
 on conflict(username,post_day) do update
 set message=excluded.message,study=excluded.study,source_updated_at=excluded.source_updated_at,received_at=now()
 where excluded.source_updated_at >= checkpoint_study_days.source_updated_at;
 -- A stale retry is a heartbeat, never a replacement of newer totals.
 update public.checkpoint_study_days set received_at=now() where username=p_username and post_day=normalized_day returning * into daily;
 -- A correction to a day that already has cards moves that day's totals and stops there: no new feed
 -- card, and no overwriting of whichever real hour happened to share the slot. A correction to a day
 -- with no cards still writes one, at the 4 a.m. start of that study day, or the day would never
 -- count toward the streak; nothing exists there to overwrite.
 if backdated and had_day then
  return jsonb_build_object('ok',true,'id',null,'date',daily.post_day,'hour',null,'updated',daily.source_updated_at=p_updated_at,'xp_awarded',0,'updated_at',daily.source_updated_at,'received_at',daily.received_at);
 end if;
 if backdated then bucket:=(normalized_day+time '04:00') at time zone zone;end if;
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
notify pgrst,'reload schema';
commit;
