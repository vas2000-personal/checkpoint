-- Run once in the Supabase SQL editor. Writes and reads go through Vercel.
create table if not exists public.checkpoint_posts (
  id uuid primary key,
  username text not null check (username ~ '^[a-z0-9_]{2,24}$'),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  post_day date generated always as ((created_at at time zone 'America/New_York')::date) stored
);
create index if not exists checkpoint_posts_feed_idx on public.checkpoint_posts (created_at desc, id desc);
create index if not exists checkpoint_posts_days_idx on public.checkpoint_posts (username, post_day);
alter table public.checkpoint_posts enable row level security;
-- Anonymous clients cannot read or write the database directly.
revoke all on public.checkpoint_posts from anon, authenticated;
grant select, insert on public.checkpoint_posts to service_role;
create or replace view public.checkpoint_days with (security_invoker = true) as
  select distinct username, post_day from public.checkpoint_posts;
revoke all on public.checkpoint_days from anon, authenticated;
grant select on public.checkpoint_days to service_role;

create table if not exists public.checkpoint_users (
  username text primary key check (username ~ '^[a-z0-9_]{2,24}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists public.checkpoint_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  username text not null references public.checkpoint_users(username) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists checkpoint_sessions_expiry_idx on public.checkpoint_sessions (expires_at);
alter table public.checkpoint_users enable row level security;
alter table public.checkpoint_sessions enable row level security;
revoke all on public.checkpoint_users, public.checkpoint_sessions from anon, authenticated;
-- Delete: /api/signup removes the user row it just created when the first session insert fails.
grant select, insert, delete on public.checkpoint_users to service_role;
grant select, insert, delete on public.checkpoint_sessions to service_role;
-- Preserve identities from posts created before multi-user sessions were added.
insert into public.checkpoint_users (username,display_name)
select distinct username,username from public.checkpoint_posts on conflict do nothing;
