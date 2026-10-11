# Connect Miss Log to Checkpoint

Account: **gir** · Display name: **Varun**

Send **POST https://checkpoint.vas-anbu.dev/api/checkpoint** with:

```http
Authorization: Bearer <your private key>
Content-Type: application/json
```

The key is in the separate private local file. Keep it in a private setting, OS keychain, or server-side secret. Never commit it, embed it in a publicly served page bundle, put it in a URL, or log the Authorization header. This key can update only gir's study entries and break status. The family board remains publicly readable as before.

## Daily sync

```json
{
  "date": "2026-10-11",
  "text": "Studied 2 h 10 min in 3 sessions. 120 questions, 84 correct (70%). 200 cards reviewed. Daily target hit.",
  "study": {
    "minutes": 130,
    "sessions": 3,
    "questions": 120,
    "correct": 84,
    "cards_reviewed": 200,
    "target_minutes": 120,
    "target_hit": true
  },
  "updated_at": "2026-10-11T21:05:00-04:00"
}
```

Send immediately after changes and every five minutes while Miss Log is open. Send a fresh updated_at timestamp with an offset or Z; the example above illustrates the format, so use the actual current time. Repeated requests for the same date update one entry. The first post of that calendar day, including a manual post, earns 100 XP; later syncs earn none. Older updated_at values cannot overwrite newer totals. A retry still refreshes the last-received heartbeat.

Use the profile's time zone for date (default America/New_York). Date may be omitted and is then derived from updated_at in that zone. Explicit dates allow a final update for a previous day after midnight. Future dates are rejected. Changing the profile time zone affects new dates, preserving historical saved days. Sign in as gir and use “Your day, your pace” to change the zone.

Counts must be nonnegative integers, correct <= questions, minutes and target_minutes <= 1440, and other counts <= 1,000,000. target_hit must equal minutes >= target_minutes. Zero questions displays no accuracy. Text is required, up to 2,000 characters. Total payload limit is 16 KiB. Only the listed fields are accepted. Send summaries and counts only, never question contents, topics or notes.

Successful response is HTTP 200:

```json
{"ok":true,"id":"<entry UUID>","date":"2026-10-11","updated":true,"xp_awarded":100,"updated_at":"<saved timestamp>","received_at":"<server receipt timestamp>"}
```

updated is false for an older payload that was ignored. Handle HTTP 401 (missing/invalid/revoked key), 400 (invalid input), 413 (too large), and 502/503 (temporary service issue). Retry temporary failures with backoff and retain the original payload timestamp for retries. Browser clients can use the endpoint's CORS preflight with Authorization and Content-Type. No cookie is needed or used for authorization.

## Break mode

Send the same POST and bearer header with:

```json
{"holiday":true,"until":"2026-10-20"}
```

The break starts on the current day in the profile's time zone and lasts **through Oct 20 inclusive**. It preserves an existing streak without adding days or XP. It cannot repair gaps before the break. Updates during a break still earn XP normally. The maximum break is one year. Change or end a break from the signed-in profile's settings (“Resume today”). The banner disappears after the final break day.

## Profile display and iPhone

The feed shows study counts and last updated time. After 15 minutes without a received sync it displays “app closed”; this is an inactivity indication, not a guarantee the app actually closed. Weekly accuracy is total correct / total questions, rather than an average of daily percentages. The chart covers today and the six preceding days.

In Safari on iPhone, use Share → Add to Home Screen. Checkpoint has a standalone manifest, app icons, safe-area spacing and refreshes when brought back to the foreground. Internet access is required. iOS can suspend apps in the background: the endpoint does not make Miss Log run while closed, so sync only occurs while Miss Log is able to send requests.
