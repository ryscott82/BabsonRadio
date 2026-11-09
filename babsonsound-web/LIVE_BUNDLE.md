# Live bundle: one call instead of nine (web done, iOS to do)

Why: Vercel Hobby pauses the site when server time (Active CPU) runs out, and every signed-in listener was making about 15 function calls a minute. The live page's data now comes in two calls. See `claude/cpu_audit.md` in the Babson Radio project for the audit.

## The two calls

| Call | Sign-in header | Cached | Ask every | Gives |
|---|---|---|---|---|
| `GET /api/live/bundle?part=shared&occId=<show>` | **No** (must be left off, or Vercel will not cache it) | Yes, public, 15 s + 30 s stale-while-revalidate. A cache hit runs no function | 30 s while the screen is visible | listener count, skip tally, vote tally, set list with votes, show rating (average, count) |
| `GET /api/live/bundle?part=me&sections=…&occId=<show>` | Yes | Never | 2 minutes while visible, and right after the person acts | friends and groups, your skip, your vote and whether you may vote, your set list upvotes, your stars, your reactions, host access |

Older apps that cannot split: `GET /api/live/bundle` **with** the sign-in header and no `part` returns both halves in one reply (not cached). It is still one call instead of nine.

`occId` is the show to rate (the one on air, or one that ended in the last 45 minutes, same id the rating route takes). Leave it out when there is nothing to rate: `rating` is then null. A malformed `occId` is ignored, not an error.
`sections` is a comma list of `presence, skip, vote, setlist, rating, emojis, host`. Ask only for what is on screen (the nav needs just `host`). Nothing = all. A section that failed on the server comes back `null`; keep what you had.

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

1. Keep the newest `shared.at`: a cached copy that arrives late must not replace a fresher one.
2. After the person votes, skips, rates or upvotes: show the change at once, then fetch `part=me` and a shared copy that skips the cache by adding `&t=<ms>` (once per action, not on a timer).
3. **Do not poll while the app is in the background or the screen is off.** Fetch once when it comes back (but not if you fetched in the last 10 s). The one thing that keeps going while audio plays is the listening check-in below.
4. Listening check-in `POST /api/listen {action:"beat"}`: **every 60 s** (was 30 s). The server stops counting gaps over 2 minutes, and a different device is only warned off if the first one checked in within the last 150 s.
5. Presence: still `POST /api/presence {listening:true|false, platform:"ios"}` when playing starts and stops. The 2-minute heartbeat is no longer needed: the listening check-in refreshes presence about every 2 minutes on the server. Do not remove the heartbeat from an app until this server version is live.
6. The shared call must not carry the sign-in header. In `BackendAPI`, add a variant that sends no `Authorization` (the web has `apiGetPublic`). Use the default URL cache policy so the app respects the 15 s cache too.

## What the iOS code does today (found in the repo, to replace)

| File | Calls | Every |
|---|---|---|
| `PresenceManager.swift:56, 64` | `GET /api/presence` | 30 s |
| `PresenceManager.swift:78, 90` | `POST /api/presence` heartbeat | 120 s |
| `SkipControl.swift:12, 87` | `GET /api/skip` | 10 s |
| `VoteView.swift:49, 139` | `GET /api/vote` | 10 s |
| `LiveExtrasView.swift:124` | `GET /api/live/emojis` | per refresh |
| `LiveExtrasView.swift:153` | `GET /api/skip` | per refresh |
| `LiveExtrasView.swift:164` | `GET /api/live/rating?occId=` | per refresh |
| `ProfileExtras.swift:56` | `GET /api/host/access` | on open |
| `ListenGuard.swift:86-89` | `POST /api/listen` beat | 30 s (change to 60 s) |
| `LiveExtrasView.swift:141` | `GET /api/live/song-rating` | once per song (leave) |

Those cadences are the biggest cost left: they are 3x faster than the web was. Old builds keep working because every old route still answers, and they get the sign-in cache below, but they will not get cheaper until they switch.

## Also changed on the server

- Verified sign-in tokens are remembered for up to 5 minutes per server instance, never past the token's own expiry (`lib/tokenCache.ts`, used in `lib/server/http.ts`). Deleting an account forgets its tokens at once. The verified-email rule and the access level still run on every call.
- Per-route server time is logged next to the read meter: `[cpu-meter]` lines in Vercel Logs (one per minute per instance) and the admin page **Server load** (`/admin/server-load`, API `/api/admin/cpu-meter`). Turn off with `CPU_METER=0`. The minute total is exact; the split between routes is an estimate.
