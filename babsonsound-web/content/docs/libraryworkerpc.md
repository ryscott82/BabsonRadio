# Library worker on the studio PC

The music library jobs (clean titles and artists, find covers, find beats, even out loudness) run on the studio PC, not on Vercel. Admins queue them in **Admin Panel → Music library**, approve what comes back, then queue **Apply**.

```
Admin Panel ──queues──► Firestore workerJobs ──(listener)──► tools/pc-worker on the studio PC
                                                               │ runs tools/*.py --json, low priority
                                                               │ pauses while a show is live
Admin Panel ◄──review── Firestore workerProposals ◄──pending────┘
Apply (approved only) ──► POST /api/worker/changes (logged first) ──► AzuraCast
```

| Piece | Where | Docs |
|---|---|---|
| Queue, proposals, change log, API | website | `babsonsound-web/LIBRARY_WORKER.md` |
| Worker service | `tools/pc-worker` | `tools/pc-worker/README.md` (Windows install, service account, NSSM, test) |
| The tools it runs | `tools/azuracast_export.py`, `apply_metadata.py`, `fetch_album_art.py`, `analyze_beats.py`, `normalize_loudness.py` (shared code in `tools/azlib.py`) | top of each file |
| Dead-air monitor | `tools/deadair_monitor.py` (same PC, same service account) | `tools/pc-worker/README.md`, "Dead-air monitor" |

Which job runs which tool:

| Job | Tool | Changes AzuraCast? |
|---|---|---|
| library.scan | azuracast_export.py --json | no |
| library.fetch_metadata | apply_metadata.py --propose | no |
| library.fetch_art | fetch_album_art.py --find | no |
| library.analyze_beats | analyze_beats.py --json | no |
| library.measure_loudness | normalize_loudness.py --measure | no |
| library.apply | apply_metadata.py / fetch_album_art.py / normalize_loudness.py --plan (beats are stored by the site) | only with ALLOW_APPLY=1, approved proposals only, each change logged first |
| library.undo | the same tools with the old values | same as apply |
| schedule.reconcile | POST /api/worker/reconcile | no |

Safety rules in short: dry run by default (`ALLOW_APPLY=0`), `JOB_LIMIT=3` for the first test, one job at a time, about one AzuraCast call a second with back-off, stop after 20 failures in a row, only listed job types and checked params, nothing from the database is ever run as a command, and secrets only in the PC's `.env` files (logs are scrubbed).

Covers: changing a cover saves the old one in `tools/art_backup` first, so undo can put it back. Keep that folder.
