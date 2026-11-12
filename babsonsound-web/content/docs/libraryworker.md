# Library worker: API contract

A job queue the studio PC picks up. Nothing listener-facing depends on the PC. If it is off, jobs wait and the daily Vercel cron still checks the schedule.

## Setup (once)
1. Make `WORKER_SECRET` (32+ chars), set it in Vercel and on the PC. Redeploy.
2. `firebase deploy --only firestore:rules` and `--only firestore:indexes`.
3. Test the rules locally: `npm i --no-save @firebase/rules-unit-testing firebase` then `npx firebase-tools emulators:exec --only firestore --project demo-babsonradio "node --test tests/rules/worker.rules.test.mjs"`.
4. As admin, `POST /api/admin/library/beats-import` once (copies `data/beats.json` into Firestore).

## Worker login (PC)
`POST /api/worker/token` with headers `x-worker-nonce: <ms>.<random 8-64 letters/digits>` and `x-worker-sig: hex(HMAC-SHA256(WORKER_SECRET, "worker:" + nonce))`. Nonce time must be within 2 minutes. Reply `{token, expiresAt}`. Sign in with `signInWithCustomToken` (uid `studio-worker`, claim `worker:true`). Rules refuse a session whose login is older than about 65 minutes, so call the route again each hour.
Other worker routes accept either the signed headers or `Authorization: Bearer <worker ID token>`.

## Worker routes
- `POST /api/worker/reconcile` -> `{ok, at}`. Runs the schedule check once. Call every 15 minutes.
- `POST /api/worker/enqueue` body `{type: "library.scan"}` -> `{id}`. The PC asks for a scan when it sees new media (hourly check). Only that type; 409 BR-LIB-005 if one is already queued or running.
- `POST /api/worker/changes` body `{jobId, changes:[{songId, field, old, new, undoOf?, artist?, title?}]}` (max 200). Only while that job is `running`. Fields: title, artist, album, art, amplify, beat (beat needs artist and title). `library.apply` may only change songs whose proposal is approved or applied. `library.undo` must set `undoOf`. Other job types cannot change the library. `GET ?jobId=&after=` lists changes (100 per page).

## Firestore (worker may read/write only these three)
- `workerJobs/{id}`: type, params, status (queued|running|done|failed|cancelled), createdBy, createdAt, startedAt, finishedAt, progress {done,total,note}, error. Worker may only change status (queued->running, running->done|failed), startedAt, finishedAt, progress, error. Listen with `where status == "queued"`. Skip jobs that flip to cancelled.
- `workerProposals/{songId}`: songId, current {title,artist,album}, proposed {title,artist,album,artUrl?,confidence 0-1,source}, status (pending|approved|rejected|applied|failed), beat? {bpm,firstBeat}, loudness? {lufs,gainDb}, **sortKey** = `norm(artist)|norm(title)` (worker writes it; used for search), **updatedAt as a Firestore Timestamp**. Worker creates as pending only; after apply sets applied or failed (+error); can set pending again to re-propose. Never overwrites approved or rejected.
- `workerStatus/pc`: lastSeen (Timestamp), version, currentJobId, liveNow, pausedForShow. Heartbeat every 5 minutes and at each job start and end. Admin sees "online" if lastSeen is under 11 minutes old.
- `libraryChanges` (append-only) and `libraryBeats` are server-only.

## Job types and params (unknown keys are refused)
| type | params |
|---|---|
| library.scan | full? bool |
| library.fetch_metadata | songIds? (max 5000), onlyMissing? |
| library.fetch_art | songIds?, onlyMissing? |
| library.analyze_beats | songIds?, force? |
| library.measure_loudness | songIds?, targetLufs? (-30 to -5) |
| library.apply | proposalIds? (max 500), kinds? (metadata, art, amplify, beat). Approved proposals only |
| library.undo | jobId or changeIds (max 500), one required. Each change is undone once |
| schedule.reconcile | none |

## Admin routes (Admin only)
- `POST /api/admin/library/jobs` `{type, params}` -> job. Refused if the same type is queued or running.
- `GET /api/admin/library/jobs?before=<ms>` -> `{jobs, next}` (25 per page).
- `POST /api/admin/library/jobs/{id}/cancel`.
- `GET /api/admin/library/proposals?status=&q=&page=&after=` -> 50 per page, `next` cursor. Use `after` instead of `page` (page > 1 costs reads, capped at 40). `q` is a prefix of "artist|title".
- `POST .../proposals/approve` `{ids}` (max 400) or `{minConfidence}` (0.5 to 1, 400 per call, `more` tells you to repeat) -> `{changed, skipped}`.
- `POST .../proposals/reject` `{ids}`.
- `POST .../proposals/edit` `{id, fields:{title?,artist?,album?,artUrl? (https)}}` -> back to pending, source manual, confidence 1.
- `GET .../status` -> `{online, lastSeen, currentJobId, liveNow, version}`.
- `GET .../changes?jobId=&after=`.
- `POST .../beats-import` `{force?}`.
Frontend: fetch on page open and after actions. Do not poll.

## Error codes
BR-LIB-001 not set up (503), 002 PC not accepted (401), 003 job type not allowed, 004 params invalid, 005 already queued (409), 006 job not found (404), 007 already finished (409), 008 proposal can't be changed (409), 009 edit invalid (400), 010 request invalid (400), 011 change refused (409), 012 beats shard full (413), 013 too many tries (429). Details in ERROR_CODES.md.

## The PC side
`tools/pc-worker` (install: `tools/pc-worker/README.md`). It runs the Python tools in `tools/` as child processes in `--json` mode.

## Cost
No polling. Worker uses one listener on queued jobs. Reconcile is about 99 reads per run (about 9.5k a day at 15 minutes, the same the dead-air monitor used to spend on Vercel). Daily cron fallback adds about 99.
