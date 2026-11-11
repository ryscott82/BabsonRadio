# Live bundle and listening check-in (web done, iOS to do)

Why: Vercel Hobby pauses the site when server time (Active CPU) runs out, and we cannot pay for more. Every signed-in listener used to make about 15 function calls a minute; v1 cut that to about 2, v2 to about 0.1 (one call every 12 minutes while playing). See `claude/cpu_audit.md`, `claude/cpu_plan_v2.md` and `claude/cpu_plan_v2_report.md` in the Babson Radio project.

## The new flow for iOS (v2). Do this, in this order

1. **When the person taps play: `POST /api/listen`**
   `{ "action": "start", "sessionId": "<new uuid>", "device": "ios", "deviceId": "<stable id>", "takeOver": false, "sections": "presence,skip,vote,setlist,rating,emojis,host", "occId": "<show to rate or empty>" }`
   One call does everything: the one-device rule, being counted as tuned in (the old `POST /api/presence` is no longer needed), and your own data.
   Reply: `{ ok: true, refreshSec: 720, idleMin, sessionMaxMin, level, access: { level }, me: { …MeBundle… } }` or `{ ok: false, reason, message }`
   (`elsewhere` = another device is playing: ask, then call again with `takeOver: true`; `quiet`; `budget`).
   `sections` is optional: leave it out and no `me` comes back. Use the `me` exactly like the `me` half below.
2. **While playing: `POST /api/listen { "action": "refresh", "sessionId", "device", "deviceId", "sections", "occId" }` every `refreshSec` seconds** (default 720 = 12 minutes; the server can change it, so read it from every reply and never hard-code it). Also send one when the app comes back to the foreground, unless the last check-in was under 2 minutes ago. Ask for `sections` without the slow ones (`emojis`, `host`, `rating`) on a refresh; ask for all of them at start and when the show changes. It returns the same reply as `start` (`reason: "otherDevice"` means this device was switched away from: stop playing and show the message).
3. **On stop: `POST /api/listen { "action": "stop", "sessionId" }`**, best effort (a lost one is fine: presence expires 18 minutes after the last check-in).
4. **Idle prompt and longest session run in the app with no calls.** Ask "still listening?" after `idleMin` minutes with no touch (0 or 100000 = never); stop after `sessionMaxMin` minutes in a row (0 = no limit; default 360). The server no longer checks either one, and no longer counts daily minutes.
5. **Tallies are pushed.** Skip tally, vote tally and set list for what is on air are in one Firestore document, `liveState/current` (fields `v:1, at, skip, vote, setlist`, same shapes as the `shared` half below). Attach a Firestore snapshot listener only while the app is in the foreground and a skip button, vote card or set list is on screen, and detach when it leaves. The listener needs the person signed in (the rule is: signed-in users can read, nobody can write). Do not poll `GET /api/skip`, `GET /api/vote` or `GET /api/live/setlist` any more. Keep the newest `at`.
6. **Once per page / per show, never on a timer:** the shared half (`GET /api/live/bundle?part=shared&occId=…`, no sign-in header, edge cached 60 s) for listener count and the show's average rating; host access, reactions palette and your own star rating come in the `me` sections at start and when the show changes.
7. When nothing is playing: `GET /api/live/bundle?part=me&sections=…` once when the screen opens and once per show, then at most every 12 minutes while the screen is visible. Nothing in the background.
8. After the person votes, skips, upvotes or rates: show the change at once and keep it (their own `me` value). Do not refetch: everyone else's counts arrive through the pushed document within about a minute. After rating, one shared fetch with `&t=<ms>` shows the new average.

Remove: the 30 s presence poll, the 120 s presence heartbeat, the 10 s skip and vote polls, the per-minute listen beat. Old builds keep working (see below), they just cost more.

## What old builds cost now

Older iOS builds still poll the old routes at the old speed. Signed-in requests cannot be edge cached (Vercel does not cache a request that carries a sign-in header), so the saving for them is on the server: each route remembers the last answer it gave a person and repeats it, with no database work, when the same person asks again inside a short gap: `GET /api/skip` 30 s, `/api/vote` 45 s, `/api/live/setlist` 30 s, `/api/live/rating` 60 s, `GET /api/presence` 60 s, `/api/live/emojis` and `/api/host/access` 5 minutes. The listening beat (`action: "beat"`) from an old build every 60 s reaches the database at most every 5 minutes; the rest are answered from memory. Some replies also carry `Cache-Control: private, max-age=15 or 60` so an app that honors it skips the request completely. Their own idle / session limits are no longer enforced by the server.
When the site is short of server time, throttled routes answer with the last result or an empty one (no skip on offer, no vote choices, zero friends), never an error.

## The two bundle calls (still used by the web and by iOS for the non-playing screen)

| Call | Sign-in header | Cached | Ask | Gives |
|---|---|---|---|---|
| `GET /api/live/bundle?part=shared&occId=<show>` | **No** (must be left off, or Vercel will not cache it) | Yes, public, 60 s + 120 s stale-while-revalidate. A cache hit runs no function | on page load, once per show, about every 12 minutes while visible | listener count ("who is tuned in", recomputed at most once a minute), show rating (average, count), and the skip / vote / set list tallies as first loaded (later changes are pushed) |
| `GET /api/live/bundle?part=me&sections=…&occId=<show>` | Yes | Never | on page load, once per show, about every 12 minutes while visible. While playing it arrives with the check-in instead | friends and groups, your skip, your vote and whether you may vote, your set list upvotes, your stars, your reactions, host access |

Older apps that cannot split: `GET /api/live/bundle` **with** the sign-in header and no `part` returns both halves in one reply (not cached).

`occId` is the show to rate (the one on air, or one that ended in the last 45 minutes, same id the rating route takes). Leave it out when there is nothing to rate: `rating` is then null. A malformed `occId` is ignored, not an error.
`sections` is a comma list of `presence, skip, vote, setlist, rating, emojis, host`. Ask only for what is on screen (the nav needs just `host`). Nothing = all. A section that failed on the server **or was throttled because the site is short of server time** comes back `null`; keep what you had.

## Reply (`BundleReply`, version 1) — exact types in `lib/liveBundle.ts`

```
{ "v": 1,
  "shared": { "at": <ms>,
    "presence": { "count": 12 },
    "skip":   { "eligible": true, "votes": 3, "needed": 11, "skipped": false },
    "vote":   { "blockStart", "blockEnd", "threshold", "options": [{ "label", "count" }], "winner": null,
                "upNext": { "blockStart", "label" } | null, "requestsOpen": true, "requestsShow": "…" },
    "setlist": { "occId": "" | "weekly-…", "title": "", "songs": [{ "id", "text", "votes" }] },
    "rating": { "occId", "count", "avg" } | null },
  "me": { "at": <ms>,
    "presence": { "friends": [{ "uid", "firstName", "instagram"? }], "groups": [{ "kind", "label", "count", "text" }] },
    "skip": { "mine": false }, "vote": { "myVote": null, "canVote": true },
    "setlist": { "occId", "mine": ["songId", …] }, "rating": { "occId", "mine": 0 },
    "emojis": { "emojis": [...], "top": [...], "customized": false },
    "host": { "host": false, "hosting": false, "controlsOpen": false } } }
```
Guests: `friends/groups` empty, `skip.mine` false, `vote.canVote` false, `emojis` and `host` null.

Put the halves back together the way the old routes answered:
- skip (old `/api/skip`): `votes, needed, eligible` from shared; `mine` from me.
- vote (old `/api/vote`): everything in `shared.vote`, plus `myVote` and `canVote` from `me.vote`.
- set list (old `/api/live/setlist`): `shared.setlist.songs`, `mine` = the song id is in `me.setlist.mine` (only if both `occId`s match).
- show rating (old `/api/live/rating?occId=`): `avg, count` from shared, `mine` from `me.rating` (same `occId`).
- reactions (old `/api/live/emojis`): `me.emojis`. host access (old `/api/host/access`): `me.host`. presence (old `GET /api/presence`): `shared.presence.count` plus `me.presence`.

## Rules for the apps

1. Keep the newest `shared.at` / `liveState.at`: a late copy must not replace a fresher one.
2. **Do not poll while the app is in the background or the screen is off.** The one thing that keeps going while audio plays is the 12-minute check-in.
3. The shared call must not carry the sign-in header. In `BackendAPI`, add a variant that sends no `Authorization` (the web has `apiGetPublic`). Use the default URL cache policy so the app respects the cache too.

## What the iOS code does today (found in the repo, to replace)

| File | Calls | Every | Replace with |
|---|---|---|---|
| `PresenceManager.swift:56, 64` | `GET /api/presence` | 30 s | the `me.presence` section and `shared.presence.count`, from the check-in / bundle |
| `PresenceManager.swift:78, 90` | `POST /api/presence` heartbeat | 120 s | nothing: `POST /api/listen` start / refresh / stop records presence |
| `SkipControl.swift:12, 87` | `GET /api/skip` | 10 s | the pushed `liveState/current` + `me.skip` |
| `VoteView.swift:49, 139` | `GET /api/vote` | 10 s | the pushed `liveState/current` + `me.vote` |
| `LiveExtrasView.swift:124` | `GET /api/live/emojis` | per refresh | `me.emojis`, once per show |
| `LiveExtrasView.swift:153` | `GET /api/skip` | per refresh | pushed state |
| `LiveExtrasView.swift:164` | `GET /api/live/rating?occId=` | per refresh | shared `rating` + `me.rating`, once per show |
| `ProfileExtras.swift:56` | `GET /api/host/access` | on open | `me.host`, once per show |
| `ListenGuard.swift:86-89` | `POST /api/listen` beat | 30 s | `start` once, `refresh` every `refreshSec`, `stop` once |
| `LiveExtrasView.swift:141` | `GET /api/live/song-rating` | once per song | leave |

## Also changed on the server

- Verified sign-in tokens are remembered for up to 5 minutes per server instance, never past the token's own expiry (`lib/tokenCache.ts`, used in `lib/server/http.ts`). Deleting an account forgets its tokens at once. The verified-email rule and the access level still run on every call.
- Per-route server time is logged next to the read meter: `[cpu-meter]` lines in Vercel Logs (one per minute per instance) and the admin page **Server load** (`/admin/server-load`, API `/api/admin/cpu-meter`). Turn off with `CPU_METER=0`. The minute total is exact; the split between routes is an estimate.

## Server time tiers (v2)

When Vercel server time runs short (our own meter against the monthly allowance, default 4 hours; set in `usage/cpuConfig`), features ease off in tiers, and an admin can pin any tier by hand (`POST /api/admin/cpu { tierLocks: { "2": "critical" } }`): Tier 0 (stream, now playing, schedule) is never limited; Tier 1 (sign-in, `/api/me`) only at the last step; Tier 2 (presence, check-in, skip, vote, set list, ratings) is rate limited at "tight" and off at "critical"; Tier 3 (reactions, emoji palette) goes first. Every level change is logged (`[cpu-tier]` in Vercel Logs and the `cpuTierLog` collection). Server-time usage log, forecast and alerts: `/api/admin/server-usage` and `/api/admin/server-usage/forecast` (admin only).


## Now playing: backup way (v2)

Normal: ask `GET /api/nowplaying` as before (edge cached 8 s). When the site is close to its server-time limit (`nowPlayingDirect` is `auto` and pressure reached `directAt`, default 75% of the allowance, or it is set to `on` in `/api/admin/cpu`), the reply carries `"direct": { "url": "<AzuraCast public now-playing feed>" }`; otherwise `direct` is `null`. When it is set: ask `/api/nowplaying` only about once a minute, and every ~12 s read the feed at `direct.url` (no sign-in header). Read **only** `now_playing.played_at`, `live.is_live` and `live.streamer_name`; if any differs from what is on screen, ask `/api/nowplaying?t=<ms/2000>` at once. Everything shown (title, artist, cover, show, note) still comes from our route, because it applies the explicit-word filter and the show names. If the feed cannot be read twice in a row, go back to the normal way.
