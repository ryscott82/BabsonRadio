# Studio helper (go-live page on the studio PC)

The studio PC runs Chrome in kiosk mode on **babsonradio.com/booth**. People sign in with their own Babson Sound account, press **Go live**, type songs as they play, and **End show**. This small program sits between that page and BUTT. BUTT still does all the audio.

## What's on the page
Glass screens on the oak desk, sized for the studio screen (1920×1080):
- **Quiet hours banner** (very top): from 15 minutes before quiet hours it says "Quiet hours start in 12:34…", then during them "Quiet hours: keep the volume as low as possible. No loud DJ sets." with the end time. A warning only: it never stops anyone going live or recording. Quiet hours are set in Admin → Settings → Studio.
- **Bookings** (next to the banner): "Booked now by Alex" when someone else has the studio booked right now, and "Next booking: 3:00 PM, Jo" when a booking starts within 90 minutes. First names only. Walk-ins always work and nobody is ever signed out because of a booking. Signing in during your own booking (from 15 minutes before) checks you in.
- **Top**: "Welcome, Name", the last host's note, listeners and reactions, the ON AIR sign, the clock, and three buttons. **Leave a note** writes a note the next host sees at the top for 24 hours. **Audio setup** picks which input the level meter listens to (the same one BUTT streams) and which output tracks and pads play out of (it has to feed the mixer). **Sign out** ends the show first if you're live.
- **Show screen**: the show's name, time left (red in the last 5 minutes, then time over), next ad break, how long you've been talking, time on air, station ID reminder, who's on next.
- **Level screen**: what's going to the station (mixer level plus BUTT's gain): Good / Too quiet / Too loud / No sound / Dead air, a big bar against the target (-14 LUFS), and the **Auto level** switch.
- **Go live / Record a show**: two buttons above the big button pick the mode.
  - **Go live**: going live also starts BUTT's recording; ending stops it. Before going live: Mic check (ticks itself), Phone silent, Clean music.
  - **Record a show**: records in BUTT only, nothing goes on air. See "Record a show" below.
- **Tracks**: Beds, All, or search the whole library. Tap a track to play it (fades in). Play/Pause, Fade out, Talk over, and the **Music volume** fader (tracks only, not the mics).
- **Sound board**: 9 pads (keys 1 to 9) for IDs, jingles and effects.

## Auto level (optional)
BUTT has no command for gain, but its **Master Gain** can follow a MIDI control. The helper sends one through a virtual MIDI cable:
1. Install **loopMIDI** (Tobias Erichsen) and add a port. Keep the default name ("loopMIDI Port") or set `MIDI_PORT` in `.env`.
2. In the helper folder run `npm install` (adds the small MIDI add-on).
3. In BUTT: Settings → MIDI. Pick the loopMIDI port, map CC `MIDI_GAIN_CC` (default 7) on channel `MIDI_CHANNEL` (default 1) to **Master Gain**, absolute mode, soft takeover off.
4. Restart the helper. The page's **Auto level** button turns on; it moves BUTT's gain by at most half a dB a second toward the target, holds still in pauses, drops 3 dB if it would clip, and stays within ±12 dB. Turning it off puts BUTT back at 0 dB.
It can't fix a mixer that is already clipping before BUTT; the level screen says so.

## Recordings of live shows
Every go-live starts BUTT's recorder and End show stops it (set `RECORD_SHOWS=0` to turn that off). Files go to BUTT's recording folder (Settings → Record). These stay on the PC; they are not uploaded.

## Record a show (pre-recorded shows and podcasts)
For students with the **Studio badge** (E-board and admins always). The stream is never touched.

**On the page**
1. Press **Record a show** above the big button. Tick **Mic check** (ticks itself after 3 seconds of a good level) and **Phone silent**, then **Record**. The level meter works the same as for a live show.
2. While recording: the time recorded, **Pause** / **Resume**, and **Stop**. The time doesn't count while paused. Go live is not offered while a recording is going (the helper refuses it too), and Record is not offered while the station is live from this PC.
3. After **Stop**: a box to **listen back**, a **title**, and **What is it for?**: one of your studio bookings from today, one of your upcoming pre-recorded shows, or nothing. For a show, tick "I listened to the whole recording and it is clean" to have it attached to that show (without the tick it is saved but not attached; you can attach it later on the website). **Save** starts the upload. **Later** keeps it on the PC as "Not saved yet" (it is there the next time you sign in). **Delete** removes it for good after a second tap.
4. Under the button each recording shows **Uploading 42%**, **Uploaded. Telling the website…**, **Uploaded** (or "Uploaded, attached to your show"), or **Failed** with a **Retry** button. "Waiting until the live show ends" means someone went live; the upload continues after.
- Signing out (or the 10-minute idle sign-out, which never happens while recording) stops the recording and keeps it as "Not saved yet".
- Anyone signed in can Pause or Stop a recording someone else left running; only the person who started it can Resume, listen back, or Save it.

**What the helper does**
- BUTT has no pause command, so Pause stops BUTT's recorder and Resume starts a new piece. Each piece is moved out of BUTT's record folder straight away (BUTT reuses its file name and would overwrite it) into `recordings\<id>\`. Stop joins the pieces with ffmpeg without re-encoding and reads the length with ffprobe.
- **Upload**: straight from this PC to AzuraCast with the PC's own AzuraCast key (`AZURACAST_API_KEY`, the "Manage station media" user), never through the website. It uses **AzuraCast's file upload API** (the same chunked "flow" upload AzuraCast's own upload box and the website use), not SFTP: 2 MB pieces, and before each piece it asks AzuraCast whether it already has it, so a stopped upload carries on where it stopped. Files go into the folder **Student recordings** as `2026-11-12_1530_title_abc123.mp3`.
- Retries: 2, 4, 8, 16, 32 seconds… up to a minute between tries. After 6 failed tries in a row it shows **Failed**; **Retry** starts again.
- Then it tells the website (`/api/booth/recordings/start` and `/complete`, signed with `STUDIO_PC_SECRET` like the sign-in, carrying the person's own sign-in token so it counts as theirs). If the website can't be reached it keeps trying (every few minutes, for as long as it takes; up to 14 days later is accepted). The student gets the "your recording is ready" email when the website hears about it.
- **The local file is never deleted until both the upload and the website have succeeded.** After that it is kept 7 more days, then removed (checked at start and every hour). Unsaved recordings are never removed by the helper.
- Uploads wait while a show is live from this PC so they never take the stream's bandwidth (`UPLOAD_WHILE_LIVE=1` to change that).
- Everything is kept in `recordings\queue.json` and `recordings\recorder.json`, so a restart of the helper or the PC loses nothing: uploads carry on, and a recording that was going is still there.
- **Loudness (optional)**: with `NORMALIZE_RECORDINGS=1`, after a recording is uploaded and the website has it, the helper runs the PC worker's low-priority tool (`tools\normalize_loudness.py`, through `tools\pc-worker\src\python.mjs`) to measure it and set AzuraCast's **Amplify** for that one file (the file itself is not changed). It never starts while a show is live from this PC and stops if one starts. It needs Python (see the PC worker README) and the `tools` folder next to this one, or `TOOLS_DIR`. This change is not in the Music library undo log; set Amplify back in AzuraCast → Media if needed.

**Settings** (`.env`, see `.env.example`): `SITE_URL`, `RECORDINGS_DIR` (default `recordings` here; needs room for a few hours of audio), `UPLOAD_FOLDER` (default `Student recordings`), `UPLOAD_WHILE_LIVE`, `FFMPEG_PATH` / `FFPROBE_PATH` (blank if on the Path), `NORMALIZE_RECORDINGS`, `TOOLS_DIR`, `PYTHON`, `AZURACAST_STATION`. The AzuraCast user behind `AZURACAST_API_KEY` needs **Manage station media** (it already has it for background music).

**Setup once**
1. **BUTT 0.1.34 or newer** (the helper reads BUTT's "record path"). In BUTT → Settings → Record, pick the format (MP3 is safest for AzuraCast) and any folder. Keep "Split recording" off.
2. **ffmpeg** on the system Path (the PC worker needs it too). Without it, Pause still works but the pieces can't be joined; a recording with no pause doesn't need it.
3. Give the kiosk account write access to the helper folder (or set `RECORDINGS_DIR`).
4. Restart the helper. It prints `Recordings: <folder>` when it starts.

Ad break times are set in **Settings → Studio PC log → Ad breaks** (minutes past each hour and length).

## Studio browser
The header has quick links (YouTube, Google Docs, Notion) and **Browser**. They open a normal Chrome window beside the booth, split screen: the browser takes the right half and the booth keeps its left column (meter, show info, Go live). The music and sound board are only hidden, so a track that is playing keeps playing. **Full screen** gives the browser everything except a slim booth rail on the left (ON AIR, the time, End show, Split screen, Close browser); **Split screen** goes back.
- It is its own Chrome profile (`%LOCALAPPDATA%\BabsonRadioBrowser`), never the booth's or anyone's personal one. Sign-ins are kept between visits, so people can stay signed in to Google or Notion. Anyone using the studio after them can see those accounts until they sign out of them in the browser.
- The window closes when the person signs out, is signed out for being idle, or the booth goes back to the sign-in screen. While it is open the booth counts as in use for up to 3 hours.
- The helper places the window (`lib/browser-window.ps1`) and writes `C:\BabsonRadio\browser.json`; the watchdog keeps that window on top instead of the booth while it is open. Only http and https addresses open.
- Settings (optional): `CHROME_PATH`, `BROWSER_PROFILE_DIR`, `BOOTH_BROWSER_FILE`.

## Word filter on track titles
A track title typed at the booth goes out on the stream (BUTT's song title) and to the site and app. Before sending, the page reports it to the website (`/api/booth/event`), which checks it with the same filter as everywhere else plus Admin > Blocked words, and signs a title that passes. Show name and hosts are checked the same way before they are saved (`/api/booth/check-text`). The helper only puts signed titles on the stream. A blocked word shows a plain message and nothing is sent. If the website can't be reached, the title isn't sent; the show itself carries on. Show info saved with a live-show recording (title, hosts, description) has blocked words starred out when it reaches the library.

## Who can go live
- Directors and admins: any time.
- Students: an active Radio badge and one of their own shows starting within 30 minutes (or still running, up to 30 minutes after it ends).
- Anyone signed in can **end** the stream, so nobody gets stuck on air.
- Every sign-in is logged with what happened (went live, songs, signed out). Directors and admins see it in **Settings → Studio PC log**.

## One-time setup on the studio PC (Windows)
1. **Node.js 18 or newer** (nodejs.org, LTS installer).
2. **BUTT**: in Settings → Main → Server, add the station's live DJ login (AzuraCast → Streamers/DJs) and name it, for example `Station live`. Leave "Connect at startup" off. Leave the command server on (default) and **not** reachable from the network.
3. Copy this folder to the PC, for example `C:\BabsonRadio\studio-helper`.
4. Copy `.env.example` to `.env` and fill in:
   - `STUDIO_PC_SECRET`: make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Put the **same value** in Vercel as `STUDIO_PC_SECRET` and redeploy.
   - `BUTT_PATH` if BUTT is not in `C:\Program Files\butt\`.
   - `BUTT_SERVER_NAME`: the server name from step 2.
5. Double-click `chrome-local-access.reg` (needs admin). This lets the page reach the helper and read the mixer input without Chrome asking.
6. **Background music (optional)**: in AzuraCast, make a user whose role has only "Manage station media" for this station, create an API key for it, and put `AZURACAST_URL`, `AZURACAST_API_KEY` and `AZURACAST_STATION_ID` in `.env`. Make these playlists: **Beds** (background music), **Station IDs**, **Soundboard** (jingles and sound effects) and **Ads**. Names can be changed in `.env`. Turn these playlists off in AzuraCast (untick "Enable") so the auto-play never plays them by itself; the page still finds their tracks.
7. **Route the music into the mixer**: the page plays background music out of the PC's sound output. Either plug that output into a mixer channel, or use a virtual cable (VB-Audio Cable) and add it as BUTT's second input. Choose it under **Sound → Music output** on the page. Pick your headphones as **Preview output**.
8. Press Win+R, type `shell:startup`, and put shortcuts there to: BUTT, `start-helper.cmd`, `start-kiosk.cmd`.
9. Set Windows to sign in automatically to a local studio account that has no other access.

Exit kiosk Chrome with Alt+F4.

## Checking it works
- With the helper running, open `http://127.0.0.1:7781/ping` from the page's origin only. Visiting it directly in a browser tab shows "Not allowed": that is expected.
- On `/booth` the top bar shows **Helper ✓** and **BUTT ✓** before anyone signs in.
- The helper window prints every go-live, song and stop with the person's name.

## Problems
| What you see | Fix |
|---|---|
| "Studio helper isn't running" | Start `start-helper.cmd`. If it closes at once, read the message (usually a missing `.env`). |
| "BUTT isn't open" | Open BUTT. Check `BUTT_PATH` and that BUTT's command port matches `BUTT_COMMAND_PORT`. |
| BR-BTH-001 "Open this page on the studio PC" | The two `STUDIO_PC_SECRET` values differ, or the PC clock is more than 2 minutes off. |
| BR-BTH-004 | `STUDIO_PC_SECRET` is missing in Vercel. |
| Meter says "Chrome blocked the microphone" | Run `chrome-local-access.reg`, restart Chrome. Then **Sound → Mixer input**. |
| Meter reads very different from BUTT | Pick the same device under **Sound → Mixer input** as BUTT's input. BUTT's own gain or compressor also changes what goes out. |
| "The music library is not set up" | Fill in the AzuraCast lines in `.env` and restart the helper. |
| Background music plays but listeners can't hear it | The music output isn't reaching the mixer/BUTT. See step 7. |
| Record says "BUTT did not say where it saved the recording" | Update BUTT to 0.1.34 or newer. The recording is still in BUTT's record folder; copy it somewhere safe. |
| "Could not move BUTT's recording" | Another program has the file open (antivirus, a file sync). The message says where the file is. Exclude BUTT's record folder from sync. |
| "Could not join the recording (is ffmpeg installed?)" | Put ffmpeg on the system Path (or set `FFMPEG_PATH`) and restart the helper. The pieces are in `recordings\<id>\`. |
| Recording stuck on **Failed** | Usually AzuraCast is unreachable or `AZURACAST_API_KEY` lost "Manage station media". Fix it and press **Retry**. The file stays on the PC. |
| "Uploaded. Telling the website…" for a long time | The website can't be reached, or refused (the line under the list says why). It keeps trying by itself; the file stays on the PC. A refusal "Sign in again on the studio PC" means `STUDIO_PC_SECRET` differs from Vercel or the PC clock is off. |
| "Waiting until the live show ends" with nobody live | BUTT is still connected. Disconnect in BUTT. |
| Record button says "Finish studio training to record" | The person has no active Studio badge. |
| Disk filling up | Finished recordings are removed 7 days after they are saved. Unsaved ones ("Not saved yet") stay until their owner saves or deletes them; old ones can be deleted from `recordings\` by hand once you've checked nobody needs them. |
| Go live works but listeners hear the music | BUTT connected to the wrong server, or AzuraCast isn't letting the DJ login override (check Streamers/DJs). |

## Tests
`npm test` in this folder (Node 18+; 22 recommended). No BUTT, AzuraCast or website needed: they cover the upload retries and resuming, the status flow (Uploading → Uploaded / Failed → Retry), the website being down, the 7-day cleanup, waiting while live, Pause/Resume/Stop with a pretend BUTT, the loudness step, and the whole helper over HTTP (record → listen back → save → upload → website) with a pretend BUTT, ffmpeg, AzuraCast and website. The quiet-hours banner timing and booking lines are tested in the website (`npm test` in `babsonsound-web`, `lib/booth.test.ts`).

## Testing on a laptop
Set `ALLOW_LOCALHOST=1` in `.env`, run `npm run dev` in `babsonsound-web`, and open `http://localhost:3000/booth`. Use the same `STUDIO_PC_SECRET` in `.env.local`.

## Live shows are archived automatically

BUTT already records every show (`RECORD_SHOWS`, on by default). When a host goes live the helper notes who is on air and where BUTT is writing;
when the show ends (`/live/stop`, or the helper restarting after a crash) BUTT's file goes into the same upload queue as "Record a show": AzuraCast
folder `UPLOAD_FOLDER`, then the website, which makes a **private** (Babson students only) audio episode in the library.

- The booth's **Show info** button (it opens by itself after Go live if the show has no name) sets the show name, who is on it, the type and a
  description. It is saved on this PC as you type and can be changed during the show; the archive gets whatever it says when the show ends.
  Blank name = "Live show <date>"; blank contributors = the host who went live.
- `ARCHIVE_LIVE_SHOWS=0` turns it off. `ARCHIVE_MIN_SECONDS` (default 60): shorter shows are not kept.
- State is in `recordings/live.json`. Site side needs "Enable on-demand streaming" on the station in AzuraCast; the site creates a switched-off
  playlist called "Show archive" (`ARCHIVE_PLAYLIST_NAME`) with on-demand on, and the library plays files from AzuraCast directly.
