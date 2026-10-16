# Checkpoint

[![CI](https://github.com/vas2000-personal/checkpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/vas2000-personal/checkpoint/actions/workflows/ci.yml)

A Next.js 16 App Router application with React 19, Supabase persistence, and Vercel hosting. Users share daily progress; family follows along on the main page. Includes the original Pip fox mascot, SVG icons, self-hosted fonts, daily XP, streaks, and EDT/EST day boundaries.

Target repository: https://github.com/vas2000-personal/checkpoint
Target domain: https://checkpoint.vas-anbu.dev

## Development

Run `npm ci`, copy `.env.example` to `.env.local`, and set the server-only Supabase connection. Run `npm run dev`. `npm test` checks request validation, Eastern day boundaries, persistent sessions, device-specific sign-out, shared posting, pagination, the privacy contract, the Miss Log request contract, and the stylesheet cascade snapshot. `npm run build` builds the production Next.js app; `npm start` serves it. GitHub Actions runs `npm test` on Node 22 and Node 24 and `npm run build` on every pull request and on every push to `main`.

The suite lives in `tests/`, one file per concern. `server.test.js` covers username validation, bounded request bodies, same-origin writes, Eastern calendar conversion with 4 a.m. study days, independent device sessions where sign-out revokes only one of them, and pagination that falls back to the row ID when two rows share a timestamp. `study.test.js` covers Miss Log sync validation and the privacy boundary on what a sync may carry, time zones and DST with inclusive breaks, weekly accuracy weighting across empty days, and the user-scoped bearer route with its preflight. `hourly.test.js` covers the 4 a.m. study-day boundary through winter, summer and the DST changeovers, date normalization, weekly totals taken from the latest daily snapshot rather than summed hourly rows, and today’s status loading independently of feed pagination. `awake.test.js` covers which fields an awake update accepts, how a wake time maps to a study day, storage through the RPC without awarding XP, and the rule that only a yes/no about being connected ever leaves the server. `format.test.js` covers time wording and singular counts. `privacy.test.js` serializes the whole public board payload and asserts that no wake time, session token, API key, Supabase URL, question text, topic or note appears anywhere in it, that the two booleans the family does see are still there, that the viewer object has an exact key set, and that a database failure answers with a generic message. `contract.test.js` reads MISS_LOG_API.md itself and checks that every request example in it still validates and that the documented size cap, bearer token shape, response keys and status codes match the route. `css-cascade.test.js` compares every resolved (media, selector, property) value in `app/globals.css` against the committed snapshot in `tests/fixtures/css-cascade.json`, so a refactor of the stylesheet cannot move a value by accident. `npm run css:check` runs that same comparison as a standalone command with a readable diff; after an intentional style change run `npm run css:snapshot` to rewrite the snapshot and review that diff as part of the change.

## Supabase

Create a Supabase project named `checkpoint`, then run these files from the repository's `supabase/` directory in its SQL editor, in this order. Every one of them is part of a complete install; skipping a later file silently leaves a feature out rather than failing loudly.

1. `schema.sql` — posts, profiles, device sessions, the day view, RLS and service-role-only privileges.
2. `miss_log.sql` — study entries on posts, hashed API keys, break intervals, per-profile time zones, and the sync function.
3. `hourly_study.sql` — hourly snapshot buckets and the separate table of cumulative daily totals.
4. `awake_status.sql` — the awake table and its RPC, which is what makes the "Awake" status work at all. Without it the board still loads and simply never shows that status.
5. `migrations/003_backdated_buckets.sql` — replaces the sync function so that a correction to an earlier day moves that day's totals instead of adding an hourly card stamped with the current hour.
6. `migrations/004_board_stats_and_attempts.sql` — a function that computes the streak, the day count and today's status in the database, a durable rate-limit counter, and the one grant that lets a failed signup undo itself.

Steps 5 and 6 are optional in the strict sense: the server asks for them and quietly falls back when PostgREST answers 404, so a database without them still works. Without 004 the board reads its whole posting history on every load to compute one streak number, and nothing rate-limits sign-in attempts.

For a database that predates this schema, replace step 1 with `migrations/001_eastern_time.sql` (only if it still groups days in UTC), then `migrations/002_device_sessions.sql`, then `backfill-profiles.sql` to recover usernames from legacy posts; after that continue with steps 2 to 6. Original timestamps and posts remain intact throughout.

Rerunning is not uniformly safe. `schema.sql`, `migrations/002_device_sessions.sql`, `backfill-profiles.sql`, `awake_status.sql`, `migrations/003_backdated_buckets.sql` and `migrations/004_board_stats_and_attempts.sql` are written with `if not exists`, `create or replace` and `on conflict do nothing`, so running them again changes nothing. `migrations/001_eastern_time.sql`, `miss_log.sql` and `hourly_study.sql` drop and add columns, create tables and indexes without `if not exists`, and backfill rows, so each must run exactly once; a second run errors out.

Database tables use RLS and deny direct anonymous access. Next.js server routes access them with `SUPABASE_SECRET_KEY`; this key is never sent to the browser. Manual posting requires a valid device session; Miss Log syncs use a separate user-scoped bearer key. Timestamps are stored as UTC instants; new daily grouping follows each profile time zone (Eastern by default). Historical day labels stay fixed.

## Users and devices

**New user** creates a unique username with an optional display name. **Sign in** restores that username's history on any device. Each device gets its own HttpOnly cookie and a database session storing only a hash of its random token. The cookie lasts 180 days, survives browser restarts, and is Secure in production. Signing out revokes only the current device's session. Clearing browser cookies requires signing in again.

Entry remains username-only as requested. It does not verify identity: anyone who knows a username can sign in as it. The main feed is public to visitors. For exclusive account ownership later, add passwords, a PIN, or Supabase Auth.

## Vercel deployment

Import `vas2000-personal/checkpoint` in Vercel and use its automatic Next.js preset. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` directly in Vercel environment settings, then deploy. Optional `CHECKPOINT_USERNAME` controls the visitor's default profile; users can choose whose progress to follow. `CHECKPOINT_DISPLAY_NAME` supplies a fallback before users exist.

Add `checkpoint.vas-anbu.dev` in Vercel's Domains settings. At your DNS provider, add the `checkpoint` CNAME with the exact target Vercel provides. Leave root-domain DNS records alone. Vercel provisions HTTPS after validation.

The site is already live, so these are post-deployment checks rather than a launch gate. `node scripts/live-check.mjs` is the safe one: two read-only GETs, one against `/api/board` and one against the homepage, confirming the payload shape and scanning both responses for wake times, tokens, API keys and Supabase URLs. It writes nothing, needs no credentials, and a scheduled workflow runs it daily; set `CHECKPOINT_URL` to aim it at another origin. `node scripts/verify-live.mjs` is the end-to-end proof, and it writes real rows: it signs up a throwaway user, posts, creates two device sessions, and confirms shared history and independent sign-out against the live database. Run it by hand after a deployment when you want that confirmation, never from CI. Live Supabase and DNS verification require those external accounts to be accessible to the session.

## Miss Log integration

The SQL this needs is steps 2 to 4 of the ordered list above; apply it there rather than as a separate pass. See [MISS_LOG_API.md](MISS_LOG_API.md) for the request contract and iPhone Home Screen instructions. Keys are provisioned administratively and are never available through username-only sign-in.

Study days reset at 4 a.m. in each profile time zone. See MISS_LOG_API.md for client counter-reset guidance.
