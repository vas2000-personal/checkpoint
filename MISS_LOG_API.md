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

Send immediately after changes and every five minutes while Miss Log is open. Send a fresh updated_at timestamp with an offset or Z, no more than five minutes ahead; the example above illustrates the format, so use the actual current time. Repeated requests within the same local hour update one hourly entry. A new hour creates one new summary card. A separate daily record always stores the newest cumulative totals for the top status bar. Hourly cards are snapshots of the totals reached at that hour, not additional amounts to add together. The first post of that study day, including a manual post, earns 100 XP; later syncs earn none. Older updated_at values cannot overwrite newer totals. A retry still refreshes the last-received heartbeat.

Study days run from **4 a.m. through 3:59:59 a.m. the following morning**, in the profile time zone (default America/New_York). Reset Miss Log's cumulative minutes, sessions, questions, correct and cards_reviewed at 4 a.m. too. Date may be omitted and is then derived from updated_at using this boundary. Existing clients that send the timestamp's local calendar date are automatically mapped to the previous study date before 4 a.m.; an explicit older date can still update historical totals. Future study dates are rejected. Changing the profile time zone affects new dates, preserving historical saved days. Sign in as gir and use “Your day, your pace” to change the zone.

Counts must be nonnegative integers, correct <= questions, minutes and target_minutes <= 1440, and other counts <= 1,000,000. target_hit must equal minutes >= target_minutes. Zero questions displays no accuracy. Text is required, up to 2,000 characters. Total payload limit is 16 KiB. Only the listed fields are accepted. Send summaries and counts only, never question contents, topics or notes.

Successful response is HTTP 200:

```json
{"ok":true,"id":"<entry UUID>","date":"2026-10-11","hour":"<hour start timestamp>","updated":true,"xp_awarded":100,"updated_at":"<saved timestamp>","received_at":"<server receipt timestamp>"}
```

updated is false for an older payload that was ignored. Handle HTTP 401 (missing/invalid/revoked key), 400 (invalid input), 413 (too large), and 502/503 (temporary service issue). Retry temporary failures with backoff and retain the original payload timestamp for retries. Browser clients can use the endpoint's CORS preflight with Authorization and Content-Type. No cookie is needed or used for authorization.

## Break mode

Breaks require a deliberate user action. Do not send holiday because an app is closed or updates are missing. Inactivity never creates a break.

Send the same POST and bearer header with:

```json
{"holiday":true,"until":"2026-10-20"}
```

Success is HTTP 200 with `{"ok":true,"holiday":true,"until":"2026-10-20"}`. The break starts on the current study day in the profile's time zone and lasts **through Oct 20 inclusive**. It preserves an existing streak without adding days or XP. It cannot repair gaps before the break. Updates during a break still earn XP normally. The maximum break is one year. Change or end a break from the signed-in profile's settings (“Resume today”). The banner disappears after the final break day.

## Awake status

So the family can see when gir is actually up, send the first keyboard or mouse activity of each study day, in any window, not only Miss Log. Use the same POST and bearer header with:

```json
{"awake_at":"2026-10-12T07:12:00-04:00","last_active_at":"2026-10-12T14:05:00-04:00","after_idle_min":540}
```

- **awake_at** (required): the moment of the first activity after the 4 a.m. study-day start. Send it once, as soon as that activity happens. Keep sending the same awake_at for the rest of the study day.
- **last_active_at** (optional): a later heartbeat. While the user is active, send it at most every 15 minutes. It must be on the same study day as awake_at and not before it.
- **after_idle_min** (optional): whole minutes with no activity before awake_at, measured from the previous activity. Under 180 means the night never really ended, and the board shows “still up from last night” instead of a wake-up time. Send it with the first request of the day; later values are ignored.

Only these three keys are accepted. Timestamps need an offset or Z, can be no more than five minutes ahead, and can be no more than 36 hours old. The study day is derived from awake_at using the 4 a.m. boundary in the profile time zone. Retries and out-of-order requests are safe: the earliest awake_at and the latest last_active_at are kept, and the still-up flag stays with the earliest awake_at.

Successful response is HTTP 200, with the stored values:

```json
{"ok":true,"date":"2026-10-12","awake_at":"2026-10-12T11:12:00+00:00","last_active_at":"2026-10-12T18:05:00+00:00"}
```

Awake updates earn no XP, create no feed post or hourly card, and do not count toward the streak. Send times only, never window titles, app names, keystrokes or screenshots. Until the first awake_at of the day arrives, the board shows a quiet “Not at the desk yet today” after 4 a.m.

## Profile display and iPhone

The feed shows study counts and last updated time. After 15 minutes without a received sync it displays “app closed”; this is an inactivity indication, not a guarantee the app actually closed. Weekly accuracy is total correct / total questions, rather than an average of daily percentages. The chart covers this study day and the six preceding study days. Weekly totals use only the final/latest snapshot for each day, never the sum of hourly snapshots. The top status bar includes minutes, sessions, questions, correct, accuracy, cards reviewed, target minutes, target status, summary text and last updated time.

In Safari on iPhone, use Share → Add to Home Screen. Checkpoint has a standalone manifest, app icons, safe-area spacing and refreshes when brought back to the foreground. Internet access is required. iOS can suspend apps in the background: the endpoint does not make Miss Log run while closed, so sync only occurs while Miss Log is able to send requests.
