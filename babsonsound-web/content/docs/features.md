# Babson Radio: features by role

Running document. Update it whenever a feature ships or a role changes.
Legend: [x] built, [ ] planned.

## Everyone (no account)
- [x] Listen to the live stream, see now playing, album art, next song
- [x] See the weekly schedule (28 days, week buttons)
- [x] Visualizer background on the live page
- [ ] Public mode (see PUBLIC_MODE.md)

## Student (verified babson.edu, olin.edu or wellesley.edu email)
Access levels: guest, student, director, admin. Badges: radioTrained (live shows, going on air) and studioTrained. Directors and admins count as both. "Host" is anyone with a booked or approved show. Guests get live radio only.
- [x] Everything above
- [x] Show reminders (push)
- [x] Live reactions (🔥 ❤️ 🦫 🤘): a handful rain down on your screen, and one falls on everyone else's screen for each reaction (web and iOS)
- [x] Upvote songs in a host's set list
- [x] Rate the song that is playing (1 to 5 stars), saved per song
- [x] Rate a whole show or hour of music (1 to 5 stars), saved per show
- [x] See everything you rated on your profile (web)
- [x] See the message a host pinned for the show
- [x] Profile: concentration and year
- [x] Request a show slot
- [x] Invite friends: contacts with a school email or "Babson" in their details or name are listed first as "Likely at Babson" with the reason (worked out on the phone, nothing uploaded; iOS)
- [x] Contact suggestions ("Name, might be interested in Babson Radio", never the reason): only contacts with Babson in their details or that at least 1 other member saved; on by default; the phone's contacts prompt appears the first time a student opens the app; Invisible mode is the opt-out (also turns off live reactions and friend activity). Scrambled numbers only, never who saved whom. Costs one Firestore write per sync; counts rebuild once a day (iOS)
- [x] Babson's own lines (any 781-239 number) and office-style contacts (Public Safety, advising, registrar, dining and so on) are never suggested, and their numbers are never uploaded or counted. Edit `blockedNumberPrefixes` / `officeWords` in `ContactsManager` (ProfileView.swift) to add more (iOS)
- [x] Library tab (website and app): save episodes with a star, and see "Based on your interests" (from what you saved and liked; shows "New episodes" until there is something to go on)
- [x] Search (website and app): real episodes, search by title, show or category, play and save
- [x] Episodes are YouTube videos that play inside the site and app (the live stream pauses when a video starts in the app)
- [x] Contact William (signed in only)
- [x] Station-wide message banner (website and app), closable on the site
- [x] Password reset limited to one email every 3 minutes (website and app)
- [x] Send bug reports and ideas
- [ ] Email reminders (needs a sender such as Resend)

## Guest (non-school email)
- [x] Can listen live as soon as they are signed in, no trial and no time limit
- [x] Live radio only: library, uploads, show requests, host panel, training and suggestions all return 403
- [x] Reactions, ratings, slot requests and friends stay student-only

## Host (anyone with a booked or approved show)
- [x] Host tab in the menu (Live, Stats, Set list, My shows)
- [x] Stats: ratings, rank among shows, listeners per airing, reactions, best and lowest rated songs
- [x] Host page opens 4 hours before and closes 4 hours after a show
- [x] Passive feed: now playing, listeners, countdown to start and end
- [x] Pin a message to listeners for their own show
- [x] See reactions, ratings and top-upvoted songs
- [x] Enter a set list
- [x] Request schedule changes
- [ ] Recording (waiting on test recording)

## Director
- [x] Everything a host can do
- [x] Pin a message on any show in the next 7 days
- [x] Approve or deny slot requests
- [x] Edit the weekly and repeating schedule (weekly, biweekly, monthly, dates)
- [x] Create events
- [x] "Needs attention" box on the admin page
- [x] Add library episodes by pasting a YouTube link (Radio Ops > Library content); remove them there too

## Admin (super admin)
- [x] Everything a director can do
- [x] Radio Operations dashboard at /admin: on air, now playing, listeners, needs-you list, next up, tool links (see "Admin menu and Settings (Nov 2026)" below)
- [x] Station controls on the dashboard: quick buttons for Play next, Message to everyone and the ON AIR sign; skip song, emergency stop and resume (with confirm), message on one show and audio processing under "More station controls"
- [x] iOS Admin screen (profile, admins only): needs-attention, bugs and ideas with mark done, station controls, message to everyone, push notification choices
- [x] Push notifications to admin phones for reports, requests, cancellations, and station stop/resume (setup: docs/PUSH_SETUP.md)
- [x] Listening log (/admin/listening): who listened, when, how long, which device; CSV download
- [x] Manage users, levels and badges (owner accounts are protected)
- [x] Launch email tool with one-click unsubscribe
- [x] Auto-scheduler rules (one genre per night option)
- [x] Auto-scheduler learns from listeners (listener counts, song and show ratings, reactions); toggle on the scheduler page
- [x] Auto DJ by role: Directors run it day to day, Admins protect the machinery. `GET /api/admin/autoschedule` and `POST /api/admin/autoschedule` (save) and `POST /api/admin/autoschedule/run` (preview and rebuild now) are Director and Admin routes; `/api/admin/autoschedule/azuracast` (status and sync) stays Admin only. A Director reads and saves only `rules` (including a per-rule `enabled` on/off) and `defaultFillers`, and sees the master on/off read-only; a Director request that includes any other field is refused with a 403 that names it (nothing saved). A Director's save is merged onto the saved config read inside the save, so it can never put back an old Admin-only value. Admins read and save everything (master switch, time zone, planning horizon, grid, longest block, lock minutes, learn, colour changing, weights, push-to-AzuraCast, playlist map) plus the calendar feed link. Field lists: `DIRECTOR_FIELDS` and `ADMIN_FIELDS` in `lib/autoschedule.ts`. An Admin's Auto DJ save, listening-limits save and server-time (CPU) save write one `settingsLog` line per changed value, so Settings history is complete
- [x] Blocked words by role: Directors and Admins can open the list (`GET /api/admin/blocked-words`) and Directors can add words (add-only: a save that leaves out a saved word, or changes the strictness, is refused with a 403 and nothing is saved); only Admins can remove words or change the strictness. The word-filter behaviour itself is unchanged
- [x] Station controls for E-board (stored role `director`, shown as "E-board") and Admins: `GET`/`POST /api/admin/controls` (skip, emergency-stop, resume, on-air-sign, announce, clear-announcement, and `color-mode` which flips only `auto.colorChanging`) and `GET`/`POST /api/admin/play-next`. Admin only: `audio-fx` and `maintenance` (E-board gets 403, and the GET leaves their state out). Each press writes a line to `hostActions` (who, what, when); a colour-mode change also writes a Settings history line. Lists in `lib/stationControls.ts`
- [x] One dashboard call for Today (`GET /api/admin/dashboard`, E-board and Admins, kept 20 s per server): next 24 hours with `hostName` and `hostEmail` for real shows only (Auto DJ blocks carry no host; never a phone number), `pending` (up to 20 requests with `hostName`, time, length, type, `autoApproveAt`, `autoBlockedReason`, `held` and `flags`: explicit, minor, cleanHours, agreementUnsigned, conflict) with `pendingTotal`, and `critical: { siteDown, deadAir, serverTime: ok|critical|over }`
- [x] `POST /api/admin/slots/approve-all` (E-board and Admins): `{ ids }` (the exact ids shown, at most 50). Each is approved one at a time, soonest first, with the same approval as `/api/slots/decision` (agreement, free time, booking, email); only those ids are touched; a handled one answers `already handled`; the auto schedule is rebuilt once at the end. Returns `{ results: [{ id, ok, reason? }] }`
- [x] Role label: `roleLabel('director')` is "E-board" (`lib/roleLabel.ts`, shared by server and pages). The stored value `director` does not change. Server messages that named the role now say E-board
- [x] Settings rows carry `visible` (main or expert) and `enforced` (false for the daily listening and daily playlist limits). New virtual setting `cpu.protection` (relaxed, normal, strict, or custom when the values were changed by hand): choosing one writes the six tier thresholds, the reactions share and the direct-feed point in one save (Normal = today's values, Relaxed 1.25x, Strict 0.75x, clamped; `lib/protectionPresets.ts`), with one Settings history line per value that changed
- [x] Listener Insights page (/admin/insights, directors too)
- [x] Review bug reports
- [x] Admin > Server load (web, admins only, `/admin/server-load`; the Vercel server-time page): how to read Vercel's Usage page (steps and a link; wording can change), a form to enter readings (date, Active CPU hours, edge requests, function invocations, fast data transfer, optional top routes, note; accepts what Vercel shows like `1h 30m`, `1.2M`, `800 MB`; saves, edits and deletes; shows who entered each one), status (share of the allowance used, forecast month end and days left, the entered number next to our meter's estimate, the level of each tier with a lock per tier: Automatic, Normal, Slowed, Off), charts (Active CPU through the month with the allowance line, and server seconds per listener-hour over time), a history table with the meter and the gap beside each reading, what each feature costs with a what-if box (listeners x hours -> server hours), the alert and email history (last 3 months) and the per-route table of the server that answers (kept from before). It loads once in one call (`/api/admin/server-usage/overview`) and again only on Refresh or after a save: no polling. A banner on every admin page shows at 50, 75, 90 and 100% or when the forecast passes the allowance (hide it until the next step); the Admin screen on iOS shows the same banner and the current level (`/api/admin/server-usage/status`, kept 5 minutes per server)
- [x] Server-time tiers, usage log, forecast and alerts (API: /api/admin/cpu tierLocks, /api/admin/server-usage, /forecast; the page is Admin > Server load above). Listening check-in is one call at play and one every 12 minutes; tallies are pushed through liveState/current
- [x] Settings API for Admin > Settings (admins only): `GET /api/admin/settings` returns every setting with its default, allowed range, current value, whether it differs from the default, and who changed it last and when, in one call. `PATCH /api/admin/settings` with `{ changes: { "limits.refreshSec": 600, "cpu.directAt": null } }` saves any number of them (null puts a setting back to its default), checks each against the table in `lib/adminSettings.ts`, rejects the whole save with a 400 if one value is out of range (nothing is written), and returns the new full list. Values are written to the same documents as the older pages (`usage/limits`, `usage/cpuConfig`, `config/autoScheduler`). Every changed value adds one small line (who, key, old, new, time) to `settingsLog`; `GET /api/admin/settings/history?limit=50&before=<time>` lists them newest first. No polling, no new index
- [x] Library worker (needs WORKER_SECRET, see babsonsound-web/LIBRARY_WORKER.md): admins queue jobs (scan, fetch metadata and art, find beats, measure loudness, apply, undo, schedule check), the studio PC picks them up, admins approve or reject proposals, and every AzuraCast change is logged so it can be undone. Nothing listener-facing depends on the PC
- [x] Admin > Music library (web, admins only; tile in the Music section, `/admin/music-library`): a status line (studio PC online or offline with last seen, current job and progress; read on open and after actions, and every 10 seconds only while a job is running and the page is visible), run buttons (scan, fetch metadata, fetch covers, analyze beats, measure loudness, apply approved, undo last apply; each disabled while that job type is queued or running; undo asks first and says how many songs), a Review queue (old to new title, artist and album, cover thumbnail, confidence, beat and loudness; filters for status, search and low confidence under 70%; select rows to approve or reject, edit inline, "Approve all above N%"; 50 per page) and an Activity list (recent jobs, progress, errors, cancel). Cover thumbnails load from iTunes and Deezer image hosts (added to the page's image rules). The old "Library" tile for episodes is now called Episodes.
- [x] PC worker (`tools/pc-worker`, Windows service on the studio PC; install: `tools/pc-worker/README.md`, overview: `docs/LIBRARY_WORKER_PC.md`): signs in with a one-hour token from the site (no service-account key on the PC), listens for queued jobs, runs one at a time with the Python tools at low priority, pauses before each job and between songs while a show is live, about one AzuraCast call a second with back-off, stops a job after 20 failures in a row, dry run unless `ALLOW_APPLY=1`, apply only for approved proposals with each change logged before it is made, resumes after a restart, heartbeat every 5 minutes (admin shows online for 11 minutes), queues a scan hourly when new media appears, schedule check every 15 minutes, rotating log with keys removed. `npm run e2e` tests it end to end with 3 songs

## Demo account (App Store review)
- [x] One hidden student account (demo flag), treated as school-verified, not listed in admin Users, never emailed

## Sign-in and account setup
- [x] Sign-in splash with email and password, or "Just listen for now" as a guest (iOS). Sign in with Apple was removed Nov 11, 2026: email and password is the only sign-in
- [x] One-time "About you" step: name, phone, graduation year, birthday or "use age range instead" (encrypted; under 13 deleted; 13 to 17 need a parent/guardian box)
- [x] New email sign-ups get 7 days (was 3) to verify
- [ ] Show age/birthday in the admin users list (stored encrypted, decrypt there)
- [ ] Ask guests for a birthday or age range too
- [ ] Website: the About you step

## Not built yet
- iOS: set list upvotes, ratings list on the profile

## Setup still needed
- Studio PC worker: set `WORKER_SECRET` in Vercel and the PC's `tools/pc-worker/.env`, make a media-only AzuraCast key, install the service and run the 3-song test (`tools/pc-worker/README.md`). Same PC: dead-air monitor service with `tools/deadair.env`
- Optional: Firestore TTL policies on `exp` for collection groups `rxEvents` (reaction events, 1 day) and `listenSessions` (listening log, 1 year)
- Add the listening log to the privacy policy before launch
- Shared-contact suggestions need `PHONE_HASH_PEPPER` set in Vercel (already used for contact matching), and App Store privacy answers should list Contacts as collected (phone numbers, scrambled, linked to the account, used for app functionality)

## What would you like to hear (votes)
- Signed-in people see a live tally for the NEXT hour (web home page, iOS Live tab button). Students, developers and guests connected to Babson can vote; one vote each, changeable until the hour starts.
- (Oct 2026 rework) Voting for an hour closes 10 minutes before it. The genre with the MOST votes wins if it has at least 3 and is strictly ahead (a tie or too few votes leaves the auto DJ's pick). It is decided once, so no early lock-in and no flip-flopping; `voteResults/{hour}` holds the outcome. Genres only: entries that look like "Artist - Song" are ignored.
- DMCA notes (not legal advice): the statutory webcasting license requires the service to be non-interactive, so listeners may steer genres but never pick specific songs or artists, and requests never play at a promised time. Also watch the sound-recording complement (no more than 3 songs from one album, or 4 from one artist, in 3 hours; at most 2 and 3 in a row): set AzuraCast's playlist/station rules to enforce it. Showing "Next:" song titles ahead of time can read as a pre-announced playlist, so consider dropping it. Check with counsel.
- Each hour offers 5 broad genres picked from a pool of 8 (same 5 for everyone, different each hour; includes Jazz House for Studying). Edit the pool in lib/server/votes.ts, or save { list: [...] } to Firestore config/voteGenres. Every genre needs an AzuraCast playlist with the same name.
- When a genre gets a majority (half) of the people who usually listen at that hour it takes over (average of the last 4 weeks of listener samples for that hour, rounded up, at least 3; 15 until there is history). The number is fixed per hour block and shown in the app. It takes over that hour from the auto-scheduler (`autoBlocks` with ruleId `vote`, never rebuilt away; booked shows stay). The AzuraCast sync runs afterwards if it is on.
- Free-text artist/song requests exist only while a live show's DJ has turned "Take requests" on in the host panel (web, Live tab). Never for the auto DJ; it switches off when the show ends. Requests (5 a day each) show in that host's panel and in Admin > Listener requests. They never play automatically. Genre votes are separate and still decide the auto-scheduled hours.

## Add a school email (guests who are students)
- Guest page (web) and Guest profile (iOS): school email, name, grad year and current password. Firebase emails a confirmation link; after clicking it they sign in again with the school email and the same password, and the first `/api/me` call upgrades the account to a student (guest pass/link removed).
- iOS reminds guests about once a week. No phone number is collected in this flow, so contact-based friends stay off until they add one.

## End-of-show feedback
- From 5 minutes before a show ends until 45 minutes after, students see "How was <show>?" with stars and an optional note (web under the player, iOS Live tab). Comments go to the host panel (Live tab > Listeners) and the rating feeds "What listeners like". Not shown for auto-DJ hours.

## Birthdays
- Optional, month and day only (Profile > About you, web and iOS). Copy shown to users: "Birthdays are only used to send you a notification and to let the DJ know when it's your birthday." (wording for you to approve).
- Used for: a daily happy-birthday push (cron /api/cron/birthdays, 12:00 UTC) to phones that turned that on, and "Birthdays today" (first name + last initial) in the host panel during an open show window.
- Admin > Birthdays shows the master list, soonest first.

## Notifications to everyone
- Settings > Notifications > Send to phones (E-board and Admins; one per person every 10 minutes) pushes a title and message to every phone that turned on "Station announcements" (Profile > Notifications in the app). Push through Firebase/Apple is free. People must allow notifications once; nothing needs to be pre-loaded. One send per 2 minutes. History is kept in the `broadcasts` collection.

## Skip votes and right pane
- On the desktop two-pane layout, reactions, ratings, set list and the skip button sit in the right pane. On narrow screens they stay under the player.
- Any signed-in listener can ask to skip the current track while the automatic playlist is running. The track skips when requests reach 90 percent of the people listening.
- Only people who are tuned in right now count. The total is the larger of the AzuraCast listener count and the app's own listening count.
- Not available during live shows.

## Simplified look (Oct 2026)
- Green-only theme; color-changing background is a per-set host switch (and an auto-DJ switch for admins), night only. Server: `liveColor/{occId}` docs, `colorChanging` in the now-playing feed, `POST /api/live/color`.
- Home is a one-screen desktop layout: player left, Today / Episodes / Shows tabs right.

## iOS hardware overhaul (Oct 2026)
- [x] Live screen rebuilt as a desk: cover sleeve with a record, leather panel with title, LED equalizer, volume dial (sets system volume), play and skip keys, reaction keys, pull-up drawer (poll, ratings, Apple Music / Spotify, tuned-in avatars, emojis).
- [x] Open Duo and iPad: two-page layout: a now playing amp on the left, one join-in amp (reactions, poll, ratings, schedule) on the right.
- [x] Full-screen boards (sideways phone and open Duo / iPad) with a QR code to react from a phone.
- [x] Every other screen (Schedule, Library, Search, Profile, sign-in, Host, Admin) uses the same desk, ceramic / leather cards, steel keys and recessed fields.
- [x] Cover color is picked quickly; the previous cover lingers briefly while the new one loads.

## Public sharing (opt-in, adults only)
- [x] Everything is students-only by default. A missing `visibility` on an episode means private (Firestore rules changed: only `visibility == 'public'` is readable by non-members). Episodes added before this are now private until a host signs.
- [x] Go On Air (`/slots`): optional "share my recordings with the public", off by default, needs all 5 agreement boxes ticked and a typed full name. The signed record is saved in `publicConsents` and the request/airSlot carries `makePublic` + `publicConsentId`.
- [x] Host page, My shows tab, "My recordings": a host signs to make one episode public, and can make it private again at any time (no signature needed). Admins can also switch to private.
- [x] Admin > Library content: add host school emails (links `hostUids`); "Public" only works when every host is a known adult and has signed for that show. Otherwise it stays students-only.
- [x] Under 18, or no birthday/age range on file, means the option is hidden/blocked on the website and re-checked on the server (BR-PUB-001/002/003). One under-18 host blocks the whole episode.
- [ ] Deploy `firestore.rules` (`firebase deploy --only firestore:rules`) before this goes live
- [ ] iOS: no public-sharing screen yet (website only)
- [ ] Have counsel look at the agreement wording (`lib/publicContent.ts`); changing it means bumping `PUBLIC_AGREEMENT_VERSION`

## Admin tidy-up (Oct 2026)
- [x] Show requests (Admin > Slots): tabs Needs a decision / Booked / Archive. Declined and cancelled requests live in Archive only. Approve is one click, notes and go-live details are optional.
- [x] Approve/decline emails to the student (needs `RESEND_API_KEY` and a verified sender domain in Resend; without it nothing is sent, nothing breaks)
- [x] Bugs & Ideas: Open and Archive tabs; "Done" moves a report to the archive
- [x] Listener insights: Dashboard tab (headline numbers, what to do, audience chart) and Raw data tab
- [x] A scheduled show that is not the auto DJ and has no track info now shows the show name and host(s) (or the streamer name) instead of a song, and song ratings, "next" and beat sync are skipped for it. Shazam-style detection was not added (costly, unreliable on live talk, and extra licensing)
- [x] Skip button: the 90% count now uses signed-in listeners (AzuraCast's number included people who cannot vote), the check also runs on every poll, and a failed skip now shows an error instead of failing silently. If it still fails, the AzuraCast API key needs "Manage station broadcasting"
- [x] Progress bar under the title is centered in the home player
- [x] Schedule page explains reminders are iPhone push notifications, not browser pop-ups
- [x] iOS About you: the save button only shows when something changed

- [ ] Live DJ track names: setup guide is in `docs/DJ_METADATA_SETUP.md` (untested at the booth); clean-up + album-art lookup and an external now-playing endpoint are not built yet

## Security hardening (Oct 2026)
- [x] Next.js 16.4.3 and firebase-admin 14.5.0 (clears the critical image-optimizer and `use cache` advisories and the google-gax, gaxios, uuid and teeny-request ones). `npm audit --omit=dev` still lists the browser `firebase` package's Node-only gRPC dependency; the site never runs it on the server
- [x] Owner accounts (OWNER_EMAILS) only count once the email is verified
- [x] Sign-up limits (email sign-up): per IP, per email domain, and whole site per minute. Normal sign-ups see nothing. Several from one IP in 10 minutes, a busy minute, or repeated failures ask for a Cloudflare Turnstile check (BR-ACC-022); the iOS app passes with App Check instead. Only clearly abusive levels return 429 (BR-ACC-023). IPs are stored as a keyed hash; counters expire on their own
- [x] Verify within 7 days or be locked, deleted after 14 days (guests too; the demo account is exempt). Locked accounts reach only `/api/me`, `/api/auth/*`, delete, add-school-email and guest status; web and iOS show only "Verify your email". One reminder email around day 10 (needs Resend). Deletions run inside the daily birthdays cron, are logged to `accountDeletions` as "unverified after 14 days", and free the email
- [x] Contacts can't be used as a reverse phone lookup: verified school email only (BR-CON-004), App Check on iOS, one sync a day per route, a cap of about 5,000 new numbers per rolling 30 days (one doc per member of 8-byte tags), and a sync that looks like a scrape (500+ matches, or 70% of a big list) pauses that account (BR-CON-007) and shows under Notifications
- [x] `/api/contacts/match` returns only the matched hashes and whether the connection is mutual: no uid, no first name
- [x] Matches show the name you saved in your own contacts. The iPhone keeps hash → contact name for matched members and sends only those names (`/api/contacts/labels`); the server stores each encrypted on your own connection and returns it only to you, so the website shows the same name. Friends without a saved name fall back to the first name. The admin friends map keeps account names
- [x] Settings → Phone lookup (admins only): type a number, see the account; every lookup is logged (last 4 digits only); paused contact syncs are listed there to clear
- [x] `/api/art` serves only this station's own pictures (`/api/station/babson_radio/…`), JPEG/PNG/WebP, with nosniff and a locked-down CSP
- [x] Security headers on every response: HSTS, nosniff, referrer policy, frame protection, permissions policy, no `X-Powered-By`; the CSP is report-only first
- [x] Names on song and playlist requests come from the saved profile, not the sign-in token; names, request text and rating comments go through the word filter (BR-ACC-025); the client can no longer write `firstName` or `displayName` straight to Firestore
- [x] `/api/health` is admin-only (or `x-health-key`); `/api/live/rating` GET is edge-cached for signed-out callers; RSS feed values are escaped; picture links must be exactly our bucket's link for that path; dead-air email body is HTML-escaped; the iOS launch pass lives in the Keychain
- [ ] Switch the CSP from report-only to enforcing after checking the console on the live site (see `babsonsound-web/SECURITY_SETUP.md`)

## Studio training (built Oct 29, 2026 — do NOT ship before launch)
Server side is done; the website and app screens are the Frontend's job. Full notes: `babsonsound-web/STUDIO.md`. The old "I'm at my training" flow and the manual grant on Admin > Training still work; remove them once Frontend ships Studio.
- [x] Sessions (`trainingSessions`): title, what it covers (studio / radio), time, place, capacity, a required Director or Admin trainer; scheduled → checkin_open → closed → confirmed
- [x] Only the trainer (or an Admin) opens check-in, which closes itself 15 minutes after the session ends. The trainer's page gets a rotating 6-digit code (30-second windows) and a QR link, the next ten at once so there is no polling; the secret never leaves the server
- [x] Students check in with the code: verified school email, one check-in per person per session, 5 tries a minute, locked 15 minutes after 10 wrong codes, wrong codes logged. Guests get 403 BR-PERM-001 on every Studio route
- [x] Trainer sees the attendee list, removes people, then confirms attendance. The quiz and agreement open only for a confirmed row; passing the quiz and signing grants every badge the session covers. Radio needs Studio (held, or granted in the same session). Directors and admins skip training
- [x] Badges end on the next June 30, 11:59 PM Eastern (`studioExpiresAt` / `radioExpiresAt` on the profile; `lib/server/access.ts` treats an expired badge as not trained). New live-show requests are blocked after expiry (BR-TRN-010); approved shows stay on the schedule
- [x] Notices 14 days before expiry and again May 1 to 3 (email through Resend and a push; the in-app banner reads `training` from `/api/me`), sent from the daily birthdays cron
- [x] Admin endpoints: roster with filters, revoke (director or admin, typed reason of 10+ characters), grant or extend by hand with a reason (director or admin), CSV by session / person / roster, club recruiting list (`clubInterest`) with CSV
- [x] Grants are append-only (`trainingGrants`): they change only by setting the revoke fields
- [ ] Run `node --env-file=.env.local scripts/studio-migrate-expiry.mjs --apply` once after deploy (existing badges end 2027-06-30)
- [ ] Frontend: trainer page (code + QR), student check-in page (`/studio/checkin?session=…&code=…`), quiz + agreement page, admin roster / sessions / recruits pages, expiry banner
- [ ] Real quiz questions and agreement text: change only `lib/studioConfig.ts`

## Show requests: faster path (Nov 2026)
- [x] `GET /api/slots/options` (members): `{ canLive, trainedReason: null|'training'|'expired', agreementSigned, lastShow, rules, weekHasShow }` in one call for the request screen; private, never cached, not polled
- [x] `GET /api/slots/open?from&to` (members): taken times only (booked shows and pending requests), no names or titles, at most 14 days; kept 60 s per server, marked s-maxage=60 + stale-while-revalidate
- [x] `POST /api/slots/request` takes `repeatWeeks` (0 to 3): one group (`groupId`), conflicting weeks are skipped and listed, a group counts as one pending request; the show title, description and location go through the word filter
- [x] A pending request approves itself 24 hours after it was made (default; an Admin can change it), or 12 hours before the show if that is sooner (default) (`autoApproveAt`). It runs the same approval as staff (`approveRequest`), and still needs: the on-air agreement signed, the radio badge for live shows, the time still free, not held by staff, and at most one auto-approved show per person per Monday to Sunday week (New York). Otherwise it stays pending with `autoBlockedReason` (`week-limit`, `agreement`, `training`, `conflict`, `past`)
- [x] The show-request numbers are Admin settings (Admin > Settings, `GET` and `PATCH /api/admin/settings`, stored in `config/slotRules`, one read cached 20 s per server, defaults are the old values): `slots.afterHours` (1 to 72, default 24), `slots.beforeStartHours` (1 to 72, 12), `slots.weekLimit` (1 to 7, 1 automatic approval per person per week), `slots.maxRepeatWeeks` (0 to 8, 3; 0 turns repeating off), `slots.minLeadHours` (0 to 168, 24). The request, repeat, options and approval code read them; `GET /api/slots/options` returns the current numbers in `rules`
- [x] `approvedBy` ('auto' or the staff uid) on the booking and the request; a show staff approved by hand does not use the week's automatic slot
- [x] `POST /api/slots/hold` (director): keep a request for a person to decide; `POST /api/slots/repeat` (same time next week, 1 to 3 weeks); `POST /api/slots/update` (change the https audio link of your own pre-recorded show); `GET /api/slots/mine` also returns `autoApproveAt`, `autoBlockedReason`, `held`, `approvedBy`, `groupId`
- [x] No third cron (Vercel Hobby allows two). The approver runs inside both daily crons, the studio PC's 15-minute check, the now-playing route (at most every 5 minutes per server while the site is open), Admin > Slots (`POST /api/slots/auto-run`), My shows and `GET /api/admin/slot-requests`. Worst case with none of those running: about 21 hours late; a free outside pinger on `GET /api/cron/slots-auto` (Bearer `CRON_SECRET`, every 15 minutes) keeps it within 15 minutes
- [ ] Frontend: Admin > Slots must call `POST /api/slots/auto-run` when it opens (it reads Firestore directly); request screen, hold button and "approves itself at ..." text on My shows

## Admin menu and Settings (Nov 2026)
- [x] The whole admin panel is called Settings (nav link, page title, back bar, docs). Its left menu is drawn by the admin layout, so it stays on every admin page and view (search, the tabs with their numbers, Back to site); on a page, its tab is highlighted and choosing a tab goes to it. It has seven tabs in this order: Overview (home), Users, Shows, Content, Notifications, Documentation (Admins only; opens the docs page) and Advanced. E-board sees all but Documentation and Advanced; Advanced is Admins only. Anything Admin-only is hidden, not greyed out, for E-board. Users: Users and roles, Training (who is trained), Phone changes, Phone lookup, Birthdays, Studio PC log. Shows: Schedule, Show requests, Show changes, Auto DJ, Set lists. Content: Episodes, Music library, Uploads, Song requests, Blocked words (E-board add-only) and a "Content library" section (Review queue, Library activity, Loudness and beats, Cover art defaults; existing pages, grouped). Notifications is its own page (`/admin/notifications`) with an unread count on the tab. Advanced (the old Customize and System merged) lands in four short groups: Server (Server load), Limits and defaults (Listening limits, Expert settings), Site and content settings (Studio form, Easter eggs, Page text, Launch email) and Tools (Stats, Bugs and ideas, Tests); the Bugs and ideas count shows on the Advanced tab for Admins only. Rule: what people need often is in an everyday tab; rare, default-value or Admin-only things are in Advanced. E-board still reaches Stats from search and the More links on the home page. Every old address and # link keeps working (#people to Users, #music to Content, #system, #customize, #settings and #rules to Advanced, #onair to Shows, #messages to Notifications; /admin/notify goes to /admin/notifications; /admin/settings goes to the page the setting lives on). Search covers every page and setting a person may open. The role rules, old links and Back targets live in `lib/adminMenu.ts` (tested)
- [x] Search box in the admin menu also finds settings (Admins): a result opens the page the setting lives on with that row highlighted (`?focus=<key>`, see `lib/settingsHome.ts`)
- [x] Overview (/admin, the home tab) for E-board and Admins: a red critical strip (only when the stream is down, there is dead air, or server time is critical or over), then four boxes in a 2 by 2 grid that fills the window, each scrolling inside itself: Controls (a grid of buttons, each with the icon and its name beside it, a short tooltip on hover and keyboard focus, an aria-label, a filled icon when a switch is on: Skip song, Emergency stop in red, Resume, ON AIR sign, Color mode, Announcement, Play a song next, and for Admins only More with audio processing and maintenance mode; Emergency stop and Resume ask first); Coming up (at least the next 10 student-run shows however far away, every one in the next 24 hours if there are more, at most 30, never Auto DJ blocks, with day, time, host name and a Copy email button, never a phone number); Needs approval (Approve all at its top; each request shows "Auto approved in X hours", or "Needs hand review" with the reason only when something really blocks it, a "Check" note for explicit words, a minor host or clean hours, the host's name as a link to their profile page (role, radio and studio training, show history; no email, phone or Instagram; `GET /api/admin/users/profile`), and Approve, Decline (red) and Hold buttons); and Report a bug (one box that files a bug report through `/api/feedback`). On phones the order is Controls, Needs approval, Coming up, Report a bug. ONE data call (`GET /api/admin/dashboard`, 28 day feed shared with the schedule page) every 60 seconds while the tab is visible and never faster; the alerts are read once by the left menu, and the switch state once for the icons. Logic in `lib/todayPage.ts`, `lib/todayData.ts` and `lib/controlButtons.ts` (tested)
- [x] Switching a tab on the Settings page pushes a history entry (the address hash), so the browser Back button returns to the tab before. Every admin page's Back bar returns to the tab that page belongs to (never plain home), or to the tab you searched from, and goes to home when that tab is hidden from the role (E-board on Stats). Logic in `backTarget` (`lib/adminMenu.ts`, tested for every page)
- [x] Notifications (/admin/notifications, E-board and Admins): the inbox (the alerts from `GET /api/admin/alerts`: Dismiss, Restore, dismissed count, a link to the page each alert is about; "All clear" when empty; read when the page opens and every 60 seconds while the tab is visible), and Send to phones: title (60) and message (160) with a live preview, "Goes to N phones" before sending, a confirm box repeating the title, message and count (it cannot be undone), and the sent history. Not built: "Which alerts reach my phone" (the website has no route that reads or writes a person's own device alert kinds; see the report). Logic in `lib/notificationsPage.ts` (tested)
- [x] The station announcement (`GET` and `POST /api/admin/broadcast`) is now E-board and Admin (it was Admin only). Same length limits; at most one announcement per person every 10 minutes (HTTP 429 with a plain sentence, rest of the staff are not blocked); each send writes a `hostActions` line with `uid`, `action: 'broadcast'`, `title`, `recipients` and `at`. Students and guests get 403. Logic in `lib/broadcastGuard.ts` (tested)
- [x] Admin pages use the whole screen width (no narrow centered column and no empty side bars; phones unchanged). Server load is compact and full width: a quick entry at the very top (date prefilled with today, Active CPU, Edge requests, Function calls and Data transfer, one Save that sends one add through the same endpoint and checks as the full form, then refreshes the meter and forecast; it shows the last reading and when it was entered), charts side by side, denser tables, and the long form under a collapsed "Full entry form". Vercel's Usage page needs all four numbers, so the quick entry asks for all four
- [x] Each Admin-only setting sits on the page it controls, using SettingRow and the one-call settings endpoint (no Settings tab): Show requests has a "Request rules" box at the bottom (approves-after hours and the weekly automatic-approval limit; the other three in a closed Advanced fold); Auto DJ keeps rules and playlists on top and a closed "Advanced (Admins only)" fold; Listening (System) has the still-listening minutes, stop-after minutes, sleep hours and one "Use different limits for guests" switch (off unless students and guests already differ; off writes both groups) and a closed Expert fold; Server load has the monthly allowance, Protection level (Relaxed, Normal, Strict, or Custom if the values were changed by hand) and the reactions switch, and a closed Expert fold. Settings that do nothing today (daily listening and playlist limits) are in Expert only and say "Not enforced right now". Each row has a plain question, one line of help, unit, the recommended value, Reset only when changed, who changed it and when, and a confirm box on important values. Listening and Server load start with a status line ("Everything is on the recommended settings." or "N changed from recommended") and Reset all to recommended (a confirm that names who is affected; only changed keys are sent). Expert settings (`/admin/expert`, System) is the full searchable list with a Changed filter and History. Logic in `lib/settingsGroups.ts`, `lib/settingsHome.ts` and `lib/settingRow.ts` (tested)
- [x] Auto DJ page for Directors (`/admin/autoschedule`, Directors and Admins): the top section "Rules and playlists" has the weekly blocks (days, times, playlists, priority, each block on/off), default playlists, Preview a rebuild, Rebuild now and Correct the schedule. Below it, "Advanced (Admins only)" (master switch, learn, colour changing, time zone, fill-ahead, planning grid, longest block, lock minutes, how often each playlist plays, AzuraCast connection and sync, playlist map, calendar feed) is only drawn for Admins, not greyed out for Directors. A Director's save sends only `rules` and `defaultFillers` (`savePayload` in `lib/autoPage.ts`); a refused save shows the server's sentence
- [x] Blocked words for Directors (`/admin/blocked-words`): an "Add a word" box and the list of words staff added, with no remove buttons and no strictness choice. Admins keep the full editor (`lib/blockedWordsPage.ts`)
- [x] Show requests show how each pending request will be handled, in Admin > Slots and in the student's My requests: "Approves automatically on <time>", "Waiting for staff (week limit)" (or another reason) or "Held". Staff get Hold / Release hold (`POST /api/slots/hold`). Wording in `lib/slotWording.ts` (tested); text is 16 px or larger
- [x] The month's server-time status is read once and shared (`lib/usageStore.ts`) by the top banner; Today's critical strip uses the dashboard's own `critical.serverTime`. Role words: E-board is how the stored role `director` is shown to people (`roleLabel` in `lib/roleLabel.ts`); the stored value did not change

## Studio bookings, guests, strikes, recordings (Nov 2026, backend)
- Studio bookings (Studio badge): instant confirm, 30-minute steps, 30 to 90 minutes, open 7:00 to 23:00, at most 2 upcoming held, 30 days ahead, free cancel until 2 hours before, room capacity from Settings (12). Live shows hold the studio unless the request says no studio. Quiet hours (Mon-Fri 9-16 and 22-7) only show a warning, never block.
- Bookings not checked in within 15 minutes are released and the person gets an email (done lazily, no new cron). Studio PC reads `/api/booth/studio-status` once per page open; walk-ins never need a booking.
- Live shows are capped at 90 minutes (existing longer ones are left alone). Show requests and bookings need guests (or "just me") and a policy tick. Guest lists are visible to the host, E-board and Admin only, and deleted 90 days after the date. Guest name suggestions never expose emails.
- Strikes: detection only flags (pending). E-board and Admin confirm or excuse. 1 mistake, 2 warning, 3 semester ban (blocks show requests and studio bookings until the semester end date, which E-board can lift). Members see their standing at `/api/me/standing`.
- Popular times: weekly averages per show category from existing listener data, built lazily when the options page is opened.
- Recordings: the studio PC uploads straight to AzuraCast; the site stores details only. A pre-recorded show with an attached clean recording plays through a one-time AzuraCast playlist.
- [x] Studio PC page (`/booth`): a quiet-hours banner from 15 minutes before quiet hours (with a countdown) and during them, "Booked now by <name>" (only when it isn't your booking) and "Next booking: <time>, <name>" within 90 minutes; signing in checks you in to your booking. Warnings only. Logic in `quietBanner` and `bookingLines` (`lib/booth.ts`, tested); `/api/booth/studio-status` now also returns `bookings` (with ids) and `quietStartsAt`.
- [x] Record a show on the studio PC (Studio badge): BUTT's recorder only, no stream; Pause/Resume/Stop, listen back, title, the booking or pre-recorded show it is for, Save. The helper keeps the file, uploads it straight to AzuraCast (flow upload API, resumable, retried, folder "Student recordings"), then calls `/api/booth/recordings/start` and `/complete` signed by the PC with the person's token (`r` claim; accepted up to 14 days later, so the site being down loses nothing). Complete attaches it to the show when "clean" was ticked. Local file kept until both succeed, then 7 days. Optional loudness step with the PC worker's tool. Details in `tools/studio-helper/README.md`; helper tests with `npm test` there.
- Club events: public list, E-board and Admin edit.
- New Admin settings: `studio.*` and `strikes.*` (capacity is on the main page, the rest under Expert).

## Members page, studio booking screens, Host a show, E-board lists (Nov 2026, website)
- [x] Main bar: Live, Schedule, Library, Members, About. The old Shows list is now the Shows section of the Library (Library has Shows and Episodes). `/shows` and `/browse` redirect to the Library; `/shows/<name>` pages are unchanged. Guests (not a school email) see Live and Members (events and info only).
- [x] Members (`/members`, everyone can open it): Next up for me, Host a show, Studio, Standing, Training, Club events, Info, top to bottom. Signed-out people and guests see only Club events and Info, with a sign-in prompt (the other sections are hidden, not greyed). Booking needs the Studio badge; without it the Studio card shows a Get trained button.
- [x] Studio card: a day list of 30-minute blocks (7 AM to 11 PM, from `/api/studio/open`, loaded on open and on week change), tap a block, pick 30, 60 or 90 minutes (only lengths that fit), guests, the policy box, instant confirm. Shows "You have N of 2 bookings", cancel until 2 hours before, the note that walk-ins still work, and My recordings (with "Schedule this to air"). Quiet hours are shaded and give a one-line warning; nothing is ever blocked.
- [x] Guests (booking form and Host a show form): type-ahead from `/api/people/suggest` (250 ms after typing, keyboard friendly), each suggestion shows a name and a masked email, typed names plus emails also work, chips, "Just me", how many more people fit, outside emails marked. A person's full email is never shown on the page.
- [x] Host a show (`/slots`): three steps on one page: pick a time (live or pre-recorded, length chips, next open times, a day list with booked, too-soon and popular times, the weekly notice), the show (title, one line, category, More options with picture, special requests, "I am not using the studio", ratings, public sharing), send (guests, policy box, Request this time). Live shows are at most 90 minutes and say "Uses the studio". Popular times from `/api/slots/popular` shade the grid in three levels and show a line like "Popular for Podcast shows: Tue 8-10 pm" (a hint only). Add to calendar (.ics, built in the browser). The draft is kept in the browser when storage allows it. My shows: when a request is approved, Same time next week, Repeat more weeks, audio link, withdraw or cancel, Pick another time after a decline.
- [x] Host a show appears on Members (first card), the Schedule page (button, and "Host here" on an Auto DJ block), the bottom of the Library, the profile menu (first item), after training ("You can now host"), My shows, the booking confirmation and the recordings list ("Schedule this to air").
- [x] Standing: Good standing, 1 mistake, Warning or "Banned until <date>", with dates and reasons. A banned person sees why and until when instead of the booking and request forms.
- [x] Admin (E-board and Admin), Shows tab: Strikes (pending flags with Confirm, Excuse with a note, Take back for a confirmed one, and a manual add; the same pending list is at the top of Notifications), Studio list (upcoming bookings and shows with guest names and emails, Copy, CSV), Club events (add, edit, delete). Standing flag on Users rows and on Needs approval rows. Schedule has an "Everything on air" view: weekly shows, one-time events, approved shows, pending requests (labeled pending) and Auto DJ, with filters.
- [x] All of these screens use text of 16 px or larger, load on open and on week change, and never poll.

## iOS: Members tab, Library merge, studio booking, Host a show, E-board screens (Nov 2026, app)
- [x] Tab bar is four tabs: Live, Schedule, Library, Members. No More tab, no separate Host tab. Guests see Live and Members (events and info only). The old Shows tab is a section of Library (Shows above Episodes, "Host a show" card at the bottom); the Host tab moved into Members as a "Host panel" card for hosts
- [x] Members (`MembersView.swift`): Next up for me, Host a show, Studio (book, my bookings, my recordings), Standing, Training (badges, sessions with RSVP, host training), Club events, Info, and E-board tools for E-board and Admin only. Loads on open and on pull to refresh; no timers
- [x] Studio booking (`StudioBookView.swift`): day strip and 30-minute blocks from `/api/studio/open`, length chips 30/60/90, who is coming, policy tick, instant confirm. Quiet hours are tinted with the one-line warning, never blocking. 2-booking limit state. Cancel with a warning inside 2 hours. Walk-in note. No Studio badge: "Get trained" scrolls to Training
- [x] Guests (`GuestPicker.swift`): type-ahead from `/api/people/suggest` (debounced 300 ms, 2+ letters), masked emails only, typed "name email" works, chips, Just me, capacity line, outside emails marked
- [x] Host a show (`HostShowView.swift`): the website's three steps (Pick a time, Your show, Send). Live max 90 minutes, "Uses the studio" with "I am not using the studio", quiet-hours warning, popular-times shading and line (hints only), weekly approval notice, policy tick, My shows with "Same time next week" and "Pick another time". Entry points: Members, top bar of every tab, Library, Schedule ("Host here" on open Auto DJ times), Profile, after training ("You can now host"), recordings ("Schedule this to air")
- [x] Add to Calendar shares a one-event `.ics` file through the share sheet, so the app asks for no calendar permission and never reads the calendar
- [x] E-board screens (`StaffViews.swift`): Strikes (confirm, excuse with a note, take back, manual add) and the Studio and guest list (copy, CSV through the share sheet). The role is called E-board in the app
- [x] Removed timers: the Host tab check (every minute) and the training "waiting" check (every 5 seconds) now load on open; "Check again" button. The Host panel's own live refresh while a show is on air is unchanged
- [ ] Not compiled or run on a device (written without Xcode); see claude/members_studio_ios_report.md
