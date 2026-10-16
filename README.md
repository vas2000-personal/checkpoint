# Checkpoint

[![CI](https://github.com/vas2000-personal/checkpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/vas2000-personal/checkpoint/actions/workflows/ci.yml)

A Next.js 16 App Router application with React 19, Supabase persistence, and Vercel hosting. Users share daily progress; family follows along on the main page. Includes the original Pip fox mascot, SVG icons, self-hosted fonts, daily XP, streaks, and EDT/EST day boundaries.

Target repository: https://github.com/vas2000-personal/checkpoint
Target domain: https://checkpoint.vas-anbu.dev

## Development

Run `npm ci`, copy `.env.example` to `.env.local`, and set the server-only Supabase connection. Run `npm run dev`. `npm test` checks request validation, Eastern day boundaries, persistent sessions, device-specific sign-out, shared posting, pagination, the privacy contract, the Miss Log request contract, and the stylesheet cascade snapshot. `npm run build` builds the production Next.js app; `npm start` serves it. GitHub Actions runs `npm test` on Node 22 and Node 24 and `npm run build` on every pull request and on every push to `main`.

The suite lives in `tests/`, one file per concern. `server.test.js` covers username validation, bounded request bodies, same-origin writes, Eastern calendar conversion with 4 a.m. study days, independent device sessions where sign-out revokes only one of them, and pagination that falls back to the row ID when two rows share a timestamp. `study.test.js` covers Miss Log sync validation and the privacy boundary on what a sync may carry, time zones and DST with inclusive breaks, weekly accuracy weighting across empty days, and the user-scoped bearer route with its preflight. `hourly.test.js` covers the 4 a.m. study-day boundary through winter, summer and the DST changeovers, date normalization, weekly totals taken from the latest daily snapshot rather than summed hourly rows, and today’s status loading independently of feed pagination. `awake.test.js` covers which fields an awake update accepts, how a wake time maps to a study day, storage through the RPC without awarding XP, and the rule that only a yes/no about being connected ever leaves the server. `format.test.js` covers time wording and singular counts. `enter.test.js` covers signing in and enrolling: the un-enrolled username-only path that must never change, the two per-factor attempt counters and their locks, that a wrong recovery code cannot deny the passphrase path, the bounded parallel-guess window, a credential write whose one-time code survives a failing follow-up, a recovery code that works while the passphrase is locked out, the refusal of any passphrase change that does not present the current passphrase or the recovery code, and the 404 codes that mean "migration not applied" rather than "fail open". `passphrase.test.js` covers the scrypt string, its stored parameters, the length cap that keeps an oversized passphrase away from scrypt, recovery-code normalization, log redaction of secrets, and that migration 005 is transactional. `privacy.test.js` serializes the whole public board payload and asserts that no wake time, session token, API key, Supabase URL, question text, topic or note appears anywhere in it, that the two booleans the family does see are still there, that the viewer object has an exact key set, and that a database failure answers with a generic message. `contract.test.js` reads MISS_LOG_API.md itself and checks that every request example in it still validates and that the documented size cap, bearer token shape, response keys and status codes match the route. `css-cascade.test.js` compares every resolved (media, selector, property) value in `app/globals.css` against the committed snapshot in `tests/fixtures/css-cascade.json`, so a refactor of the stylesheet cannot move a value by accident. `npm run css:check` runs that same comparison as a standalone command with a readable diff; after an intentional style change run `npm run css:snapshot` to rewrite the snapshot and review that diff as part of the change.

## Supabase

Create a Supabase project named `checkpoint`, then run these files from the repository's `supabase/` directory in its SQL editor, in this order. Every one of them is part of a complete install; skipping a later file silently leaves a feature out rather than failing loudly.

1. `schema.sql` — posts, profiles, device sessions, the day view, RLS and service-role-only privileges.
2. `miss_log.sql` — study entries on posts, hashed API keys, break intervals, per-profile time zones, and the sync function.
3. `hourly_study.sql` — hourly snapshot buckets and the separate table of cumulative daily totals.
4. `awake_status.sql` — the awake table and its RPC, which is what makes the "Awake" status work at all. Without it the board still loads and simply never shows that status.
5. `migrations/003_backdated_buckets.sql` — replaces the sync function so that a correction to an earlier day moves that day's totals instead of adding an hourly card stamped with the current hour.
6. `migrations/004_board_stats_and_attempts.sql` — a function that computes the streak, the day count and today's status in the database, a durable rate-limit counter, and the one grant that lets a failed signup undo itself.
7. `migrations/005_passphrases.sql` — the opt-in passphrase: the `checkpoint_credentials` table, service-role-only privileges, and the function that counts failed attempts per factor and locks that factor for up to 15 minutes, one UPDATE statement each. Run the migration, not a copy of it: it is wrapped in `begin`/`commit` so the table cannot exist for even a moment without the `revoke` that keeps it off the anon REST API.

Steps 5 to 7 are optional in the strict sense: the server asks for them and quietly falls back when PostgREST reports that the table or function does not exist (`PGRST205` or `PGRST202`), so a database without them still works. Without 004 the board reads its whole posting history on every load to compute one streak number, and nothing rate-limits sign-in attempts. Without 005 nobody is enrolled and entry is username-only.

Only those two codes are read as "not applied". Any other 404 — a stale PostgREST schema cache, a paused project, a replica, a gateway — is a fault, and the authentication paths fail closed on it: `/api/enter` answers 502 rather than waving an enrolled account through on its username, and a rate-limit check that cannot be reached answers 503 rather than allowing unlimited guesses. The one place that genuinely cannot tell is a database with no `checkpoint_credentials` table at all, and when that fallback fires it logs `PASSPHRASE CHECK BYPASSED` on every sign-in, because it is a global bypass.

For a database that predates this schema, replace step 1 with `migrations/001_eastern_time.sql` (only if it still groups days in UTC), then `migrations/002_device_sessions.sql`, then `backfill-profiles.sql` to recover usernames from legacy posts; after that continue with steps 2 to 7. Original timestamps and posts remain intact throughout.

Rerunning is not uniformly safe. `schema.sql`, `migrations/002_device_sessions.sql`, `backfill-profiles.sql`, `awake_status.sql`, `migrations/003_backdated_buckets.sql`, `migrations/004_board_stats_and_attempts.sql` and `migrations/005_passphrases.sql` are written with `if not exists`, `create or replace` and `on conflict do nothing`, so running them again changes nothing. `migrations/001_eastern_time.sql`, `miss_log.sql` and `hourly_study.sql` drop and add columns, create tables and indexes without `if not exists`, and backfill rows, so each must run exactly once; a second run errors out.

Database tables use RLS and deny direct anonymous access. Next.js server routes access them with `SUPABASE_SECRET_KEY`; this key is never sent to the browser. Manual posting requires a valid device session; Miss Log syncs use a separate user-scoped bearer key. Timestamps are stored as UTC instants; new daily grouping follows each profile time zone (Eastern by default). Historical day labels stay fixed.

## Users and devices

**New user** creates a unique username with an optional display name. **Sign in** restores that username's history on any device. Each device gets its own HttpOnly cookie and a database session storing only a hash of its random token. The cookie lasts 180 days, survives browser restarts, and is Secure in production. Signing out revokes only the current device's session. Clearing browser cookies requires signing in again.

Entry stays username-only by default, as requested, and that default does not verify identity: anyone who knows a username can sign in as it. The main feed is public to visitors.

### The optional passphrase

A username may opt in to a passphrase, from the offer shown after signing in or from Settings. Enrollment is never automatic and nothing is required of anyone who does not want it. **A device that already carries a valid session sees nothing** — no prompt, no offer, no banner — and keeps reading and posting with no friction. What a passphrase changes is that a *new* device has to type it before a session is issued.

The passphrase is stored only as a scrypt string (N=16384, r=8, p=1, a fresh 16-byte salt, a 64-byte key). Enrollment also shows an 80-bit recovery code once, of which only a sha256 is stored.

Five wrong attempts lock the account. The lock is sized from an **escalation level**, not from the strike count: each time a lock is armed the level steps up, so the waits run 60 s, 2 min, 4 min, 8 min and then 15 min, and only a *correct* attempt clears the level. The strike count itself decays to one when a spent lock is seen, which is what stops the owner's next single typo relocking them instantly at the cap — they get four more tries first. An earlier version sized the lock from that decayed count, so it could never exceed the first step and the measured ceiling was a flat 60 s, i.e. five guesses a minute for ever rather than the doubling this paragraph used to claim. The 15-minute cap is deliberate, because a permanent lock would turn any username a stranger knows into a denial-of-service switch against its owner. A lock is armed only when nothing is armed already, so a burst of parallel guesses arms one lock instead of escalating once per request.

The passphrase and the recovery code are metered **separately**, each with its own counter, level and lock, and each lock gates only its own factor. With one shared counter, anybody who knows the public username could burn wrong recovery codes until the lock that gates the *passphrase* hit 15 minutes, and then keep it there indefinitely at the 10-per-minute limit — the owner's correct passphrase answered `429`. What is still accepted is narrower: a stranger can make the *recovery* path wait (for up to 15 minutes, capped), and can still lock the passphrase path by guessing passphrases, which is the lockout doing its job.

A recovery code is accepted even while the *passphrase* is locked out, at sign-in and in Settings alike: it is the way back in, not a guess. The reverse holds too — a locked recovery path never refuses the passphrase. Using a code at sign-in deletes the credential row, which honestly returns the account to username-only entry and offers enrollment again, rather than leaving it half-locked.

The window for parallel guesses is left open on purpose. Every in-flight request reads `locked_until` from its own `SELECT`, so inside one minute as many guesses can reach scrypt as the limiter allows, and that number is ten (`rateLimit('enter:…',10,60)`). Closing it fully would mean a pre-check and an increment in a single statement, which costs a round trip on *every* sign-in; a test pins the ten so it cannot silently get worse.

**Changing or removing a passphrase requires the current passphrase or the recovery code. Nothing else.** In particular a live session is not authority over the credential. An earlier design let a session older than the credential row rewrite it, meant as a way for a real owner to reclaim a squatted username; it was removed because usernames are public (they ship in the board payload for the profile selector), so anyone can sign in to an un-enrolled name today, keep the 180-day cookie, and hold a permanent master key over every future enrollment of that name — which would have protected nobody.

A recovery code is shown exactly once, so losing it must not be how an account dies. It is stashed in `sessionStorage` the moment it arrives and cleared only by "I've saved it", so Escape, the in-dialog brand link, closing the dialog and reloading the page all put it straight back on screen; a credential write also returns its code before any optional follow-up work, so signing other devices out can no longer fail the write and discard the code with it. And while the passphrase is still known, changing it issues a fresh code — which is the way back from a response that was dropped in flight after the row was already written. The screen says so.

So if both the passphrase and the recovery code are lost, there is exactly one way back, and it is manual: an operator deletes that row, which returns the account to username-only entry and grants no access by itself. The statement is commented at the bottom of `migrations/005_passphrases.sql`.

For stronger account ownership than this, add Supabase Auth.

## Vercel deployment

Import `vas2000-personal/checkpoint` in Vercel and use its automatic Next.js preset. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` directly in Vercel environment settings, then deploy. Optional `CHECKPOINT_USERNAME` controls the visitor's default profile; users can choose whose progress to follow. `CHECKPOINT_DISPLAY_NAME` supplies a fallback before users exist.

Add `checkpoint.vas-anbu.dev` in Vercel's Domains settings. At your DNS provider, add the `checkpoint` CNAME with the exact target Vercel provides. Leave root-domain DNS records alone. Vercel provisions HTTPS after validation.

The site is already live, so these are post-deployment checks rather than a launch gate. `node scripts/live-check.mjs` is the safe one: two read-only GETs, one against `/api/board` and one against the homepage, confirming the payload shape and scanning both responses for wake times, tokens, API keys and Supabase URLs. It writes nothing, needs no credentials, and a scheduled workflow runs it daily; set `CHECKPOINT_URL` to aim it at another origin. `node scripts/verify-live.mjs` is the end-to-end proof, and it writes real rows: it signs up a throwaway user, posts, creates two device sessions, and confirms shared history and independent sign-out against the live database. Run it by hand after a deployment when you want that confirmation, never from CI. Live Supabase and DNS verification require those external accounts to be accessible to the session.

## Miss Log integration

The SQL this needs is steps 2 to 4 of the ordered list above; apply it there rather than as a separate pass. See [MISS_LOG_API.md](MISS_LOG_API.md) for the request contract and iPhone Home Screen instructions. Keys are provisioned administratively and are never available through username-only sign-in.

Study days reset at 4 a.m. in each profile time zone. See MISS_LOG_API.md for client counter-reset guidance.
