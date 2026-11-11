# Studio helper (go-live page on the studio PC)

The studio PC runs Chrome in kiosk mode on **babsonradio.com/booth**. People sign in with their own Babson Radio account, press **Go live**, type songs as they play, and **End show**. This small program sits between that page and BUTT. BUTT still does all the audio.

## What's on the page
Glass screens on the oak desk, sized for the studio screen (1920×1080):
- **Top**: "Welcome, Name", the last host's note, listeners and reactions, the ON AIR sign, the clock, and three buttons. **Leave a note** writes a note the next host sees at the top for 24 hours. **Audio setup** picks which input the level meter listens to (the same one BUTT streams) and which output tracks and pads play out of (it has to feed the mixer). **Sign out** ends the show first if you're live.
- **Show screen**: the show's name, time left (red in the last 5 minutes, then time over), next ad break, how long you've been talking, time on air, station ID reminder, who's on next.
- **Level screen**: what's going to the station (mixer level plus BUTT's gain): Good / Too quiet / Too loud / No sound / Dead air, a big bar against the target (-14 LUFS), and the **Auto level** switch.
- **Go live / End show**: the big button. Going live also starts BUTT's recording; ending stops it. Before going live: Mic check (ticks itself), Phone silent, Clean music.
- **Tracks**: Beds, All, or search the whole library. Tap a track to play it (fades in). Play/Pause, Fade out, Talk over, and the **Music volume** fader (tracks only, not the mics).
- **Sound board**: 9 pads (keys 1 to 9) for IDs, jingles and effects.

## Auto level (optional)
BUTT has no command for gain, but its **Master Gain** can follow a MIDI control. The helper sends one through a virtual MIDI cable:
1. Install **loopMIDI** (Tobias Erichsen) and add a port. Keep the default name ("loopMIDI Port") or set `MIDI_PORT` in `.env`.
2. In the helper folder run `npm install` (adds the small MIDI add-on).
3. In BUTT: Settings → MIDI. Pick the loopMIDI port, map CC `MIDI_GAIN_CC` (default 7) on channel `MIDI_CHANNEL` (default 1) to **Master Gain**, absolute mode, soft takeover off.
4. Restart the helper. The page's **Auto level** button turns on; it moves BUTT's gain by at most half a dB a second toward the target, holds still in pauses, drops 3 dB if it would clip, and stays within ±12 dB. Turning it off puts BUTT back at 0 dB.
It can't fix a mixer that is already clipping before BUTT; the level screen says so.

## Recordings
Every go-live starts BUTT's recorder and End show stops it (set `RECORD_SHOWS=0` to turn that off). Files go to BUTT's recording folder (Settings → Record).

Ad break times are set in **Admin Panel → Studio PC log → Ad breaks** (minutes past each hour and length).

## Who can go live
- Directors and admins: any time.
- Students: an active Radio badge and one of their own shows starting within 30 minutes (or still running, up to 30 minutes after it ends).
- Anyone signed in can **end** the stream, so nobody gets stuck on air.
- Every sign-in is logged with what happened (went live, songs, signed out). Directors and admins see it in **Admin Panel → Studio PC log**.

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
| Go live works but listeners hear the music | BUTT connected to the wrong server, or AzuraCast isn't letting the DJ login override (check Streamers/DJs). |

## Testing on a laptop
Set `ALLOW_LOCALHOST=1` in `.env`, run `npm run dev` in `babsonsound-web`, and open `http://localhost:3000/booth`. Use the same `STUDIO_PC_SECRET` in `.env.local`.
