# Server load and CPU

Status as of Nov 11, 2026: all of this is built and committed (`03baf30`), **not yet deployed**. Vercel paused deployments on Nov 7 and the pause ends Dec 7.

## Why this exists

The site runs on Vercel's free Hobby plan. Hobby gives about 4 hours of "Fluid Active CPU" a month. Going over pauses the team's deployments for about 30 days (ours: Nov 7 to Dec 7). We cannot pay for more: only one-time purchases are possible, no subscriptions, and a Vercel plan cannot be prepaid. So the site is built to use as little server time as possible, and to give up optional features before the essential ones.

The original page made about 15 function calls a minute per listener (check-ins, presence, skip, vote, set list, host access, ratings, emojis). At that rate the allowance was gone after roughly 400 to 1,000 listener-hours, and the station can serve 1,500 hours a month.

## What a listener costs now

| | Original | After v1 | After v2 |
|---|---|---|---|
| Function calls per listener-hour | about 950 | about 120 | about 7 |

The 7: one call at play, five check-ins (every 12 minutes), about one tap (skip, vote, star, upvote). These are estimates from the code; the Server load page gives measured numbers. A shared floor remains that does not grow with listeners: now playing (at most 1 run per 8 s), reactions (1 per 2 s while flowing, 1 per 6 s when quiet), the shared bundle (1 per minute), the schedule (1 per 5 minutes).

## How it works

- **Check in on play, then every 12 minutes.** `POST /api/listen start` does the one-device rule, presence and returns personal data. `refresh` repeats it. The interval (`refreshSec`, default 720 s, 120 to 3600) is set in Admin > Listening limits, so it changes without an app update. Presence lasts 18 minutes after the last check-in.
- **Idle prompt and session length run in the browser or app.** Default longest session is 6 hours. The server no longer keeps per-day listening counters, so the daily limits in Admin > Listening limits are not enforced.
- **Pushed shared state.** The document `liveState/current` holds the skip tally, vote tally and set list. The server writes it only when content changes, at most once per 45 s per instance. Pages listen to it only while the tab is visible and signed in. If the listener fails, the page falls back to the edge-cached shared copy once a minute. Extra Firestore reads are listeners x (changes an hour + 1): about 820 an hour at 20 listeners and 40 changes.
- **Shared bundle (`GET /api/live/bundle`).** A shared half (same for everyone, edge cached 15 to 60 s) and a personal half (`part=me`, never cached, every 12 minutes and after actions).
- **Slow data fetched once.** Host access, the reaction palette and a person's own rating load at page load and when the show changes.
- **Hidden tabs do not poll.** The listen check-in keeps going while audio plays.
- **Sign-in tokens are remembered up to 5 minutes** per server instance (never past expiry), so repeat calls skip the signature check.
- **Old iOS routes** (skip, vote, setlist, rating, presence, emojis, host access, listen beat) answer from memory for a gap, so older app builds cost about 30% of what they did until they update.

## Tiers: what is shed first

| Tier | Features | Tight (slowed) | Critical (off) |
|---|---|---|---|
| 0 | Stream, now playing, schedule | never limited | never limited |
| 1 | Sign-in, /api/me | not limited | at 97% |
| 2 | Presence, listen check-in, skip, vote, set list, ratings | at 75% | at 90% |
| 3 | Reactions, reaction palette | at 50% | at 70% |

"Pressure" is the larger of the share of the monthly allowance used and the projected month-end share (the projection counts after a quarter of the month). Tight means one fresh answer per person per gap (skip, vote, set list and rating 20 s; presence and check-in 2 minutes; reactions 5 s; palette 1 minute; `/api/me` 30 s). Critical means the last answer or an empty one. Throttled answers look normal (no vote choices, nothing to skip, zero friends), never an error. Admins can lock a tier by hand (Automatic, Normal, Slowed, Off). Every level change and admin change is logged (`cpuTierLog`).

## Backup now-playing feed

Default: pages ask `/api/nowplaying` (edge cache 8 s + 20 s stale). At 75% pressure (or when forced on), `/api/nowplaying` also returns the AzuraCast public feed address. The page reads that feed only to notice a change and asks our route once for the full answer, and otherwise at most once a minute. After 2 failed reads it goes back to normal. Setting `nowPlayingDirect` is `auto`, `off` or `on`; `directAt` is the pressure (0.1 to 2, default 0.75). To check: the feed must allow browsers on babsonradio.com (CORS); test with `on` and watch the browser's network tab. Cost: the load moves to AzuraCast on Asura.

## Admin > Server load

One page for everything, loaded on open and on Refresh (no polling, so it does not use the server time it measures):

- How to check usage on Vercel (steps and link)
- Status: share used, forecast, entered number vs our meter, tier levels with a lock per tier
- Enter usage (parses what Vercel shows: `1h 30m`, `1.2M`, `800 MB`), history table with who entered each
- Charts: Active CPU through the month with the allowance line; server seconds per listener-hour over time
- What each feature costs, and a "what if" box (listeners x hours -> CPU hours)
- Alerts and emails, and a per-route table

The banner at the top of every admin page appears at 50, 75, 90 and 100%, or when the forecast passes the allowance. iOS Admin shows the banner and the level.

## Alerts and reminders

At 50, 75, 90 and 100% of the allowance (our meter, or the latest entered reading) and when the projected month end passes 100% (not before day 3), one admin notice and one email go to the owners and admins. Each alert can fire once per month. A Monday reminder ("Enter this week's Vercel usage") goes to the owners when no reading was entered for 6 days. It runs inside the existing daily birthdays cron, because Hobby allows only two cron jobs.

## Admin API

- `GET /api/admin/cpu`: pressure, tiers, thresholds, locks, now-playing mode. `POST` accepts `tierLocks`, `thresholds`, `budgetHours`, `nowPlayingDirect`, `directAt`.
- `GET/POST /api/admin/server-usage`: list, add, edit and delete readings (`activeCpuHours`, `edgeRequests`, `functionInvocations`, `fastDataTransferGB`, `date`, `note`, `topRoutes`).
- `GET /api/admin/server-usage/forecast`, `/overview`, `/status`: projections, the page's single load, the banner's check.
- Collections (clients denied): `serverUsage`, `usageAlerts`, `cpuTierLog`. `liveState` is readable by signed-in users.

## What to do when usage is high

1. Open Admin > Server load and read which tier is slowed and the forecast.
2. If a tier is slowed, nothing breaks; people just see fresher data less often. If critical, reactions (Tier 3) or voting and skip (Tier 2) are off.
3. Check the route table for a route far above the others, and check Vercel Usage for the same.
4. Lock Tier 3 to Off to save headroom, turn the backup now-playing feed on, or lengthen `refreshSec`.
5. If the site is paused anyway, follow "If Vercel pauses the site" in the Deploy and launch runbook.

## Decisions still open

1. **Reactions poll** is the biggest remaining shared cost (1 per 2 s while flowing). Options: leave as is, slow the normal rate to 4 s, or push reactions like the tallies (more reads).
2. **Billing cycle.** Vercel's cycle starts on the 7th; our meter and alerts use calendar months. Set `baseHours` to line them up, or add a cycle start day.
3. **Switching devices.** The old device stops at its next check-in, up to 12 minutes later.
4. **Daily listening limits** are no longer enforced; the two fields can be removed.
5. **Webhook-based now playing:** have the AzuraCast webhook write the now-playing object to Firestore so pages need no polling. About 17 function runs an hour instead of about 450. Not built.
