# Studio helper (go-live page on the studio PC)

The studio PC runs Chrome in kiosk mode on **babsonradio.com/booth**. People sign in with their own Babson Radio account, press **Go live**, type songs as they play, and **End show**. This small program sits between that page and BUTT. BUTT still does all the audio.

```
babsonradio.com/booth  ──►  helper.mjs (127.0.0.1:7781)  ──►  butt.exe -s / -d / -u / -S  ──►  running BUTT  ──►  station
        │
        └──►  /api/booth/*  (who can go live, sign-in log, song shown on the site)
```

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
5. Double-click `chrome-local-access.reg` (needs admin). This lets the page reach the helper without Chrome asking.
6. Press Win+R, type `shell:startup`, and put shortcuts there to: BUTT, `start-helper.cmd`, `start-kiosk.cmd`.
7. Set Windows to sign in automatically to a local studio account that has no other access.

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
| Go live works but listeners hear the music | BUTT connected to the wrong server, or AzuraCast isn't letting the DJ login override (check Streamers/DJs). |

## Testing on a laptop
Set `ALLOW_LOCALHOST=1` in `.env`, run `npm run dev` in `babsonsound-web`, and open `http://localhost:3000/booth`. Use the same `STUDIO_PC_SECRET` in `.env.local`.
