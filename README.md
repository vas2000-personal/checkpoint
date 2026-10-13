# Checkpoint

A Next.js 16 App Router application with React 19, Supabase persistence, and Vercel hosting. Users share daily progress; family follows along on the main page. Includes the original Pip fox mascot, SVG icons, self-hosted fonts, daily XP, streaks, and EDT/EST day boundaries.

Target repository: https://github.com/vas2000-personal/checkpoint
Target domain: https://checkpoint.vas-anbu.dev

## Development

Run `npm ci`, copy `.env.example` to `.env.local`, and set the server-only Supabase connection. Run `npm run dev`. `npm test` checks validation, Eastern day boundaries and the 4 a.m. study day, persistent sessions, device-specific sign-out, shared posting, pagination, Miss Log syncs, hourly snapshots, breaks and awake status. `npm run build` builds the production Next.js app; `npm start` serves it.

## Supabase

Create a Supabase project named `checkpoint`. In its SQL editor, run each file once, in this order:

1. `supabase/schema.sql` (new database). For an existing earlier schema instead, run `supabase/migrations/001_eastern_time.sql` if it still uses UTC, then `002_device_sessions.sql`, then `supabase/backfill-profiles.sql` to keep legacy posts' usernames.
2. `supabase/miss_log.sql`: study entries, API keys, breaks and time zones.
3. `supabase/hourly_study.sql`: hourly feed cards and daily totals.
4. `supabase/awake_status.sql`: the daily awake status (safe to rerun).

Steps 2 and 3 are not safe to run twice. Original timestamps and posts remain intact.

Database tables use RLS and deny direct anonymous access. Next.js server routes access them with `SUPABASE_SECRET_KEY`; this key is never sent to the browser. Manual posting requires a valid device session; Miss Log syncs use a separate user-scoped bearer key. Timestamps are stored as UTC instants; new daily grouping follows each profile time zone (Eastern by default). Historical day labels stay fixed.

## Users and devices

**New user** creates a unique username with an optional display name. **Sign in** restores that username's history on any device. Each device gets its own HttpOnly cookie and a database session storing only a hash of its random token. The cookie lasts 180 days, survives browser restarts, and is Secure in production. Signing out revokes only the current device's session. Clearing browser cookies requires signing in again.

Entry remains username-only as requested. It does not verify identity: anyone who knows a username can sign in as it. The main feed is public to visitors. For exclusive account ownership later, add passwords, a PIN, or Supabase Auth.

## Vercel deployment

Import `vas2000-personal/checkpoint` in Vercel and use its automatic Next.js preset. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` directly in Vercel environment settings, then deploy. Optional `CHECKPOINT_USERNAME` controls the visitor's default profile; users can choose whose progress to follow. `CHECKPOINT_DISPLAY_NAME` supplies a fallback before users exist.

Add `checkpoint.vas-anbu.dev` in Vercel's Domains settings. At your DNS provider, add the `checkpoint` CNAME with the exact target Vercel provides. Leave root-domain DNS records alone. Vercel provisions HTTPS after validation.

After a new deployment, create a real user, post an update, sign in on a second device, and confirm the shared history and independent sign-out.

## Miss Log integration

The Miss Log tables come from steps 2–4 above. See [MISS_LOG_API.md](MISS_LOG_API.md) for the request contract and iPhone Home Screen instructions. Keys are provisioned administratively and are never available through username-only sign-in. Study days reset at 4 a.m. in each profile time zone.
