-- Upgrade a previously installed UTC schema to Eastern Time.
-- Original post timestamps and messages are preserved. Historical day grouping,
-- XP, and streaks are recalculated using the timezone at each post's timestamp.
begin;
drop view if exists public.checkpoint_days;
alter table public.checkpoint_posts drop column post_day;
alter table public.checkpoint_posts
  add column post_day date generated always as ((created_at at time zone 'America/New_York')::date) stored;
create index checkpoint_posts_days_idx on public.checkpoint_posts (username, post_day);
create view public.checkpoint_days with (security_invoker = true) as
  select distinct username, post_day from public.checkpoint_posts;
revoke all on public.checkpoint_days from anon, authenticated;
grant select on public.checkpoint_days to service_role;
commit;
