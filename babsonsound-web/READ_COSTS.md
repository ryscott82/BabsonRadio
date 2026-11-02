# Firestore read costs

Firestore bills one read per document returned (a missing document, an empty query and an aggregate each count as one; `count()` is really one read per 1,000 index entries). The first 50,000 reads a day are free.

## The read meter (temporary)

`lib/server/readMeter.ts` counts the documents read by every API route. It adds no Firestore reads or writes: it wraps the SDK's read methods in memory.

- **Vercel Logs:** one line per minute per server instance, search for `[firestore-reads]`. Each line is `{ m: minute (UTC), i: instance, total, routes: { "/api/presence": [reads, requests, biggest single request], ... } }`. Add up the lines across instances for the full picture.
- **Admin endpoint:** `GET /api/admin/read-meter` (admin only) returns the last 60 minutes for the instance that answers, plus totals per route. Because each instance keeps its own numbers, call it a few times or use the logs.
- **Turn off:** set `READ_METER=0` in Vercel. **Remove** when the bill is under control: delete `lib/server/readMeter.ts`, `lib/readMeterCore.ts` (+ test), `app/api/admin/read-meter`, and the two call sites (`adminDb()` in `lib/server/admin.ts`, `handle()` and `requireUser()` in `lib/server/http.ts`).
- A read made while a cache fills is charged to the route that triggered the fill, so shared caches (schedule feed, listener list) show up under whichever route happened to refill them.
- `count()` is counted as one read, so big counts on the admin dashboard are undercounted.

## Where reads come from (live page, per signed-in listener)

Measured with a simulator that runs the real route code against a read-counting fake Firestore (50 and 300 listeners, auto DJ and live show, one server instance). The data it uses (8 connections each, 30% of listeners rated, 40% voted, 49 auto blocks) is an assumption, so treat the numbers as relative until the meter has real data.

| Route | Caller | Every | Reads per listener-min before | after |
|---|---|---|---|---|
| /api/live/rating | LiveExtras | 60 s | 90 (at 300; grows with listeners) | 0.6 |
| /api/presence (GET) | LivePlayer | 30 s playing / 90 s idle | 37 | 6.2 |
| /api/listen (POST beat) | listenGuard | 30 s | 8.4 | 2.4 |
| /api/skip | SkipButton | 20 s | 6.1 | 1.3 |
| /api/vote | VoteCard | 30 s | 5.5 | 1.6 |
| /api/host/access | Nav | 60 s | 4.1 | 1.1 |
| /api/live/emojis | LiveExtras | 60 s | 3.0 | 2.0 |
| /api/presence (POST) | LivePlayer | 120 s | 0.5 | 0.5 |
| /api/live/setlist | LiveExtras | 20 s | 0.7 | 0.7 (only while a show is on) |
| /api/live/reactions, /api/nowplaying | LiveExtras, lib/nowplaying, AnnouncementBanner | 2 to 12 s, edge cached | small | small |

## What was cached (all per server instance, in memory)

| What | TTL | Cleared on |
|---|---|---|
| Who is tuned in (presence query), shared by in-flight callers | 45 s | failure |
| Caller's mutual connections (presence friends) | 180 s | |
| Friend profile (name, invisible, Instagram); only friends who are tuned in are read | 30 s | |
| Caller's own concentrations / class year (groups) | 120 s | |
| Other listeners' group rows | 120 s | |
| Skip-vote document | 5 s | every skip vote / skip |
| Song-request switch (`liveRequests`) | 5 s | host toggles it |
| Show ratings (stars + uid only) | 30 s | someone rates |
| Set list + votes | 5 s | someone votes |
| Vote tally (`songVotes`) | 30 s | someone votes |
| Schedule collections shared by every feed (1 day, 7 days, 28 days...) | 30 s | |
| Auto-scheduler config | 20 s | saveConfig |
| Usage config | 30 s | admin usage save |
| Announcement, audio FX, ON AIR sign, maintenance | 15 s | their setters |
| Host tab check (a person's slots and weekly shows) | 90 s | |

Also: the daily listening document is only read when a daily limit applies, `/api/live/emojis` reads the user document once instead of twice, and `getAll` calls ask only for the fields they use.

## Not changed

Access levels (`accessOf`, 45 s per person) are untouched, so a role change still takes effect within 45 s. It is still one user-document read per person per ~45 s on every instance.

## Ops paths (no listeners needed)

Sizing used for these numbers (modeled, not measured): 25 weekly shows, 49 auto blocks, 12 slots, 60 days of taste data at 288 listener samples a day plus 2,000 song and 2,000 show ratings. The meter shows the real per-run reads for `/api/cron/*`.

| Path | Before | Now |
|---|---|---|
| Dead-air check-in (`tools/deadair_monitor.py`, every 60 s) | 1 read per call (1,440 a day) | same |
| Dead-air schedule refresh | every 5 min, about 99 reads (about 28,500 a day) | every 15 min (about 9,500 a day) |
| Autoschedule cron (09:00 UTC) taste scan: 4 collections over 60 days | about 21,650 a day | about 21,650 every third day, about 70 on the days between (about 7,300 a day average) |
| Admin > Insights (`tasteStats`) | a full scan after each 10 min cache gap | 1 read of `config/taste` |
| Birthdays cron | under 50 a day (about 600 a day May 1 to Jun 30 with 200 trained people) | same |

`config/taste` holds the last scan result. The scan runs when the saved copy is older than 60 h (cron) or 5 days (Insights), or when the time zone changed.

One-off scripts that read whole collections (run deliberately, not on a schedule): `scripts/migrate-roles.mjs` (users, training, testers tokens) and `scripts/studio-migrate-expiry.mjs` (users, training). `allBirthdays` (Admin) reads every user who shared a birthday.
