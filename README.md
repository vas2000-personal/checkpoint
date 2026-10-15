# Checkpoint

[![CI](https://github.com/vas2000-personal/checkpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/vas2000-personal/checkpoint/actions/workflows/ci.yml)

A Next.js 16 App Router application with React 19, Supabase persistence, and Vercel hosting. Users share daily progress; family follows along on the main page. Includes the original Pip fox mascot, SVG icons, self-hosted fonts, daily XP, streaks, and EDT/EST day boundaries.

Target repository: https://github.com/vas2000-personal/checkpoint
Target domain: https://checkpoint.vas-anbu.dev

## Development

Run `npm ci`, copy `.env.example` to `.env.local`, and set the server-only Supabase connection. Run `npm run dev`. `npm test` checks validation, Eastern day boundaries, persistent sessions, device-specific sign-out, shared posting, and pagination. `npm run build` builds the production Next.js app; `npm start` serves it.

The suite lives in `tests/`, one file per concern. `server.test.js` covers username validation, bounded request bodies, same-origin writes, Eastern calendar conversion with 4 a.m. study days, independent device sessions where sign-out revokes only one of them, and pagination that falls back to the row ID when two rows share a timestamp. `study.test.js` covers Miss Log sync validation and the privacy boundary on what a sync may carry, time zones and DST with inclusive breaks, weekly accuracy weighting across empty days, and the user-scoped bearer route with its preflight. `hourly.test.js` covers the 4 a.m. study-day boundary through winter, summer and the DST changeovers, date normalization, weekly totals taken from the latest daily snapshot rather than summed hourly rows, and today’s status loading independently of feed pagination. `awake.test.js` covers which fields an awake update accepts, how a wake time maps to a study day, storage through the RPC without awarding XP, and the rule that only a yes/no about being connected ever leaves the server. `format.test.js` covers time wording and singular counts. `npm run css:check` audits the stylesheet on its own, outside the test run.

## Supabase

Create a Supabase project named `checkpoint`, then run `supabase/schema.sql` once in its SQL editor. For an existing earlier schema, run `supabase/migrations/001_eastern_time.sql` if it still uses UTC, then `002_device_sessions.sql`. For existing legacy posts, run `supabase/backfill-profiles.sql` after the schema migration to preserve their usernames. Original timestamps and posts remain intact.

Database tables use RLS and deny direct anonymous access. Next.js server routes access them with `SUPABASE_SECRET_KEY`; this key is never sent to the browser. Manual posting requires a valid device session; Miss Log syncs use a separate user-scoped bearer key. Timestamps are stored as UTC instants; new daily grouping follows each profile time zone (Eastern by default). Historical day labels stay fixed.

## Users and devices

**New user** creates a unique username with an optional display name. **Sign in** restores that username's history on any device. Each device gets its own HttpOnly cookie and a database session storing only a hash of its random token. The cookie lasts 180 days, survives browser restarts, and is Secure in production. Signing out revokes only the current device's session. Clearing browser cookies requires signing in again.

Entry remains username-only as requested. It does not verify identity: anyone who knows a username can sign in as it. The main feed is public to visitors. For exclusive account ownership later, add passwords, a PIN, or Supabase Auth.

## Vercel deployment

Import `vas2000-personal/checkpoint` in Vercel and use its automatic Next.js preset. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` directly in Vercel environment settings, then deploy. Optional `CHECKPOINT_USERNAME` controls the visitor's default profile; users can choose whose progress to follow. `CHECKPOINT_DISPLAY_NAME` supplies a fallback before users exist.

Add `checkpoint.vas-anbu.dev` in Vercel's Domains settings. At your DNS provider, add the `checkpoint` CNAME with the exact target Vercel provides. Leave root-domain DNS records alone. Vercel provisions HTTPS after validation.

Before calling the app live, create a real user, post an update, sign in on a second device, and confirm the shared history and independent sign-out. Live Supabase and DNS verification require those external accounts to be accessible to the session.

## Miss Log integration

After the baseline schema, apply the additive upgrade in supabase/miss_log.sql once. It adds study entries, hashed API keys, break intervals and per-user time zones. See [MISS_LOG_API.md](MISS_LOG_API.md) for the request contract and iPhone Home Screen instructions. Keys are provisioned administratively and are never available through username-only sign-in.

Apply supabase/hourly_study.sql after miss_log.sql for the hourly feed and separate cumulative daily totals. Study days reset at 4 a.m. in each profile time zone. See MISS_LOG_API.md for client counter-reset guidance.
