-- Add username profiles and independent persistent device sessions.
begin;
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
grant select, insert on public.checkpoint_users to service_role;
grant select, insert, delete on public.checkpoint_sessions to service_role;
commit;
