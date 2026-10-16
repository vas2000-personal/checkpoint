begin;
-- Additive: two owner-written profile settings. Both keep today's behavior until the owner opens
-- Settings, so applying this migration changes nothing about the board the family already reads.
--
-- family_note replaces the hardcoded "A little window into my day." under the board heading. It is
-- PUBLIC by design — the parents read it signed out — so it is the one new column that may never
-- hold anything the privacy contract protects, and lib/board.js selects it for exactly that reason.
alter table public.checkpoint_users add column if not exists family_note text;
-- share_awake gates the awake boolean, and the gate is read SERVER-SIDE in lib/board.js. NOT NULL
-- DEFAULT TRUE, not nullable: a null would leave the existing row "unset" and the board would have
-- to guess which way an unset toggle points, which is how a privacy switch ends up failing open.
alter table public.checkpoint_users add column if not exists share_awake boolean not null default true;
-- The length lives in BOTH places on purpose. lib/study.js validateFamilyNote writes the sentence
-- the owner reads; this CHECK is what still holds when a write arrives by any other route — psql,
-- the Supabase table editor, a loosened validator — and a line that renders on the public board is
-- exactly the field that must not quietly become an essay.
-- Postgres has no "add constraint if not exists", so the catalog is asked first and the migration
-- stays re-runnable, the same way every "if not exists" above does.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.checkpoint_users'::regclass and conname='checkpoint_users_family_note_length') then
  alter table public.checkpoint_users add constraint checkpoint_users_family_note_length
   check(family_note is null or char_length(btrim(family_note)) between 1 and 140);
 end if;
end $$;
alter table public.checkpoint_users enable row level security;
revoke all on public.checkpoint_users from public,anon,authenticated;
-- Update: /api/settings PATCHes time_zone, display_name, family_note and share_awake, and
-- checkpoint_sync locks this row per user. Delete: /api/signup removes the row it just created when
-- the first session insert fails. Restated here so a database built only from migrations/ has them.
grant select,insert,update,delete on public.checkpoint_users to service_role;
-- GET /api/settings counts the owner's signed-in devices and reads when his Miss Log key was made.
-- Both are selects that already existed; restated so this file alone describes what the route needs.
grant select on public.checkpoint_sessions, public.checkpoint_api_keys to service_role;
notify pgrst,'reload schema';
commit;
