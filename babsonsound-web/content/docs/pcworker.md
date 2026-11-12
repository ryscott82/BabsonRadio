# Studio PC worker

Runs the library jobs that admins queue in **Admin Panel → Music library** (scan, fetch metadata, fetch covers, find beats, measure loudness, apply, undo, schedule check). It runs the Python tools in `tools/` for each job and writes what they find back as proposals for an admin to approve. Contract with the website: `babsonsound-web/LIBRARY_WORKER.md`.

How it behaves:
- **One job at a time.** It listens for queued jobs (no polling) and finishes or fails each one before taking the next.
- **Never in the way of a show.** Tools run at low priority. Before each job and before every song it checks whether a show is live (the studio helper on this PC, then the site's now-playing). If one is, it waits until the show ends. The job's progress shows "Paused: a live show is on air".
- **Gentle on AzuraCast.** About one AzuraCast call a second. It backs off on 429 and 5xx errors and stops a job after 20 failures in a row.
- **Dry run by default.** Only `library.apply` and `library.undo` change AzuraCast, and only when `ALLOW_APPLY=1`. Apply only touches approved proposals. Before each change it records the change in the change log (`libraryChanges`), so everything can be undone.
- **Resumes after a restart.** A job that was running when the PC restarted is picked up again where it stopped.
- **Checks in.** It updates `workerStatus/pc` every 5 minutes and at each job start and end. The admin page shows it online while that is under 11 minutes old.
- **Hourly media check.** If new media appeared in AzuraCast it queues `library.scan`. Every 15 minutes it asks the site to check the schedule.
- **Logs.** Everything goes to `logs/worker.log` (5 MB × 5 files) with keys and tokens removed.

## What it needs
- Windows 10/11, the studio PC (always on).
- **Node.js 22 LTS** (works on 18+), installed for all users.
- **Python 3.11+** for all users (python.org installer: tick "Install for all users" and "Add python.exe to PATH"). The `py` launcher is used by default.
- **ffmpeg** on the system PATH (for example in `C:\ffmpeg\bin`, added to the *system* Path).
- For beat analysis: as administrator, `py -3 -m pip install numpy librosa`.

## Install (once)

### 1. A separate service account
Don't run the worker as the kiosk login. Make a plain local account just for it:
1. As administrator: `net user BRWorker <long-random-password> /add`. Keep it a standard user, not an administrator.
2. **Settings → Accounts** (or `secpol.msc` → Local Policies → User Rights Assignment): give `BRWorker` **Log on as a service** and **Deny log on locally**, so nobody can sign in with it at the screen.
3. Put the repo's `tools` folder somewhere it can read, for example `C:\BabsonRadio\tools`.
4. Lock down the settings file. Right-click `C:\BabsonRadio\tools\pc-worker\.env` (after step 2 below) → Properties → Security. Remove *Users* and leave only `BRWorker`, Administrators and SYSTEM. In an admin prompt:
   `icacls C:\BabsonRadio\tools\pc-worker\.env /inheritance:r /grant:r BRWorker:R Administrators:F SYSTEM:F`
5. Give `BRWorker` write access to `pc-worker\state`, `pc-worker\logs` and `tools\art_backup` (it creates them on first run if it can write to `pc-worker` and `tools`).

### 2. Settings
In `tools\pc-worker`, run `npm install`. Copy `.env.example` to `.env` and fill it in (see "What goes where" below). Start with `JOB_LIMIT=3` and `ALLOW_APPLY=0`.

### 3. Check it
As `BRWorker` (`runas /user:BRWorker cmd`, temporarily allow local log on if needed), or as yourself for a first look:
```
cd C:\BabsonRadio\tools\pc-worker
node worker.mjs --check
```
It prints the Python, ffmpeg and librosa versions, whether a show is live, how many media files AzuraCast has, and then signs in and writes a heartbeat. The admin page should show the PC **online**.

### 4. Run it as a service (NSSM, recommended)
1. Download NSSM (nssm.cc) and put `nssm.exe` in `C:\Windows\System32`.
2. In an admin prompt:
```
nssm install BabsonRadioWorker "C:\Program Files\nodejs\node.exe" worker.mjs
nssm set BabsonRadioWorker AppDirectory C:\BabsonRadio\tools\pc-worker
nssm set BabsonRadioWorker ObjectName .\BRWorker <password>
nssm set BabsonRadioWorker Start SERVICE_AUTO_START
nssm set BabsonRadioWorker AppPriority BELOW_NORMAL_PRIORITY_CLASS
nssm set BabsonRadioWorker AppExit Default Restart
nssm set BabsonRadioWorker AppRestartDelay 30000
nssm set BabsonRadioWorker AppStopMethodConsole 5000
nssm set BabsonRadioWorker AppStdout C:\BabsonRadio\tools\pc-worker\logs\service.out.log
nssm set BabsonRadioWorker AppStderr C:\BabsonRadio\tools\pc-worker\logs\service.err.log
nssm set BabsonRadioWorker AppRotateFiles 1
nssm set BabsonRadioWorker AppRotateBytes 5000000
nssm start BabsonRadioWorker
```
NSSM restarts it 30 seconds after any exit. Stop it with `nssm stop BabsonRadioWorker`.

**Without NSSM (Task Scheduler):** create a task that runs whether or not the user is logged on, as `BRWorker`, with "Do not store password" off. Trigger: **At startup**. Action: `C:\Program Files\nodejs\node.exe` with argument `worker.mjs`, start in `C:\BabsonRadio\tools\pc-worker`. On the Settings tab, tick "If the task fails, restart every 1 minute, up to 999 times" and untick "Stop the task if it runs longer than". Set "If the task is already running: Do not start a new instance".

### 5. Keep the PC awake and updates out of show hours
- **Settings → System → Power**: Sleep **Never** (plugged in), and turn off hibernate (`powercfg /hibernate off`). Screen off is fine.
- **Settings → Windows Update → Advanced options → Active hours**: set them manually to cover show hours (for example 8:00 AM to 2:00 AM, the most Windows allows is 18 hours). Updates won't restart the PC inside them. Also turn on "Notify me when a restart is required".
- The worker and the studio helper both come back by themselves after a restart.

### 6. Test with 3 songs before any bulk run
With `JOB_LIMIT=3` and `ALLOW_APPLY=0`:
1. In Admin → Music library, run **Scan**. The job should finish with "N songs; … without art; …". The log shows `run azuracast_export.py`.
2. Run **Fetch metadata**, **Measure loudness** and **Analyze beats**. Each should finish with "3 proposals" (or fewer if nothing needed changing). Check the 3 proposals in the Review queue.
3. Approve them and run **Apply**. It is a dry run: "Dry run: N changes would be made…". Nothing in AzuraCast changes.
4. Set `ALLOW_APPLY=1` (keep `JOB_LIMIT=3`), restart the service, and run **Apply** again. Check those 3 songs in AzuraCast (Media → the song): title, artist, album and Amplify.
5. Run **Undo last apply** and check they are back. Then apply again if they were right.
6. Start a live show for a minute while a job runs. Its progress should say "Paused: a live show is on air" and continue after.
7. When all of that looks right, set `JOB_LIMIT=0` and restart for full runs.

To repeat the automatic test on any computer with Node and Python (no AzuraCast or Firebase needed): `npm run e2e`.

## What goes where

**The PC's `tools\pc-worker\.env`**

| Setting | Value |
|---|---|
| `SITE_URL` | `https://babsonradio.com` |
| `WORKER_SECRET` | the same 32+ character secret as in Vercel |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` | the website's public Firebase web-app values (Vercel's `NEXT_PUBLIC_FIREBASE_*`) |
| `AZURACAST_URL` | `https://a12.asurahosting.com` |
| `AZURACAST_STATION` | `babson_radio` |
| `AZURACAST_API_KEY` | a key for an AzuraCast user whose role can only **manage this station's media** (no broadcasting, no settings, no other stations) |
| `ALLOW_APPLY` | `0` until the 3-song test passes, then `1` |
| `JOB_LIMIT` | `3` for the test, then `0` |
| optional | `PYTHON`, `TOOLS_DIR`, `HELPER_URL`, `TARGET_LUFS`, `AZ_MIN_INTERVAL`, `LOG_DEBUG` |

No service-account key is ever put on the PC. The worker signs in with a one-hour token it gets from the site, and gets a fresh one every 50 minutes.

**Vercel** (Production): `WORKER_SECRET` (the same value), then redeploy. The Firebase Admin credentials the site already has are what mint the PC's sign-in token. Deploy the Firestore rules and indexes once: `firebase deploy --only firestore:rules,firestore:indexes`.

Make a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## AzuraCast key with media rights only
In AzuraCast: **Administration → Roles → Add role** "Library worker" with only **Station: Manage station media** on the Babson Radio station. **Users → Add** a user (for example `library-worker@…`) with that role. Sign in as that user → **My account → API keys → Add**. Put the key in `.env`. A leaked key can then only edit media, not stop the station.

## Dead-air monitor (`tools/deadair_monitor.py`), the same way
It listens to the public stream and tells the site when it goes silent.
1. Settings: copy `tools\deadair.env.example` to `tools\deadair.env` and fill in `STREAM_URL`, `SITE_URL` and `MONITOR_SECRET` (the same as `MONITOR_SECRET` or `CRON_SECRET` in Vercel). Lock it down like the worker's `.env`:
   `icacls C:\BabsonRadio\tools\deadair.env /inheritance:r /grant:r BRWorker:R Administrators:F SYSTEM:F`
2. Test: `py -3 C:\BabsonRadio\tools\deadair_monitor.py` should print that it is listening. Within a minute the site has its first report (Admin Panel shows dead-air alerts).
3. Service (same account, same rules):
```
nssm install BabsonRadioDeadAir C:\Windows\py.exe -3 deadair_monitor.py
nssm set BabsonRadioDeadAir AppDirectory C:\BabsonRadio\tools
nssm set BabsonRadioDeadAir ObjectName .\BRWorker <password>
nssm set BabsonRadioDeadAir Start SERVICE_AUTO_START
nssm set BabsonRadioDeadAir AppExit Default Restart
nssm set BabsonRadioDeadAir AppRestartDelay 30000
nssm set BabsonRadioDeadAir AppStdout C:\BabsonRadio\tools\deadair.out.log
nssm set BabsonRadioDeadAir AppStderr C:\BabsonRadio\tools\deadair.err.log
nssm set BabsonRadioDeadAir AppRotateFiles 1
nssm set BabsonRadioDeadAir AppRotateBytes 5000000
nssm start BabsonRadioDeadAir
```
   Or Task Scheduler: same as the worker, with program `C:\Windows\py.exe`, arguments `-3 deadair_monitor.py`, start in `C:\BabsonRadio\tools`.
4. Test it: stop the stream for a minute (or point `STREAM_URL` at a silent test stream). Admins should get the dead-air alert, then "Back on air".

## Problems
| What you see | Fix |
|---|---|
| Admin page says the PC is offline | `nssm status BabsonRadioWorker`; read `logs\worker.log`. A sign-in error usually means `WORKER_SECRET` differs from Vercel or the PC clock is off by more than 2 minutes. |
| Job failed "… exited with 1: … No module named librosa" | `py -3 -m pip install numpy librosa` as administrator. |
| Job failed "ffmpeg is missing" | Put ffmpeg's `bin` folder on the **system** Path, then restart the service. |
| Job stuck on "Paused: a live show is on air" with no show | Check the studio helper (`BUTT` connected?) and the site's now-playing. The worker waits while either says live. |
| "Stopped after 20 failures in a row" | AzuraCast or the network is down, or the key lost its rights. Fix it and queue the job again; it continues where it stopped. |
| Apply says "Dry run" | Set `ALLOW_APPLY=1` in `.env` and restart the service. |
