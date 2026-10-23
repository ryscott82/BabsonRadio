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
- [x] Radio Operations dashboard at /admin: on air, now playing, listeners, last 24 hours, needs-attention list, next up, tool links
- [x] Station controls on the dashboard: skip song, emergency stop and resume (with confirm), message to everyone, message on one show
- [x] iOS Admin screen (profile, admins only): needs-attention, bugs and ideas with mark done, station controls, message to everyone, push notification choices
- [x] Push notifications to admin phones for reports, requests, cancellations, and station stop/resume (setup: docs/PUSH_SETUP.md)
- [x] Listening log (/admin/listening): who listened, when, how long, which device; CSV download
- [x] Manage users, levels and badges (owner accounts are protected)
- [x] Launch email tool with one-click unsubscribe
- [x] Auto-scheduler rules (one genre per night option)
- [x] Auto-scheduler learns from listeners (listener counts, song and show ratings, reactions); toggle on the scheduler page
- [x] Listener Insights page (/admin/insights, directors too)
- [x] Review bug reports

## Demo account (App Store review)
- [x] One hidden student account (demo flag), treated as school-verified, not listed in admin Users, never emailed

## Sign-in and account setup
- [x] Sign-in splash with Sign in with Apple or email (iOS); Apple accounts add a school email and verify it within 7 days
- [x] One-time "About you" step: name, phone, graduation year, birthday or "use age range instead" (encrypted; under 13 deleted; 13 to 17 need a parent/guardian box)
- [x] New email sign-ups get 7 days (was 3) to verify
- [ ] Show age/birthday in the admin users list (stored encrypted, decrypt there)
- [ ] Ask guests for a birthday or age range too
- [ ] Website: Sign in with Apple, and the About you step
- Setup: docs/APPLE_SIGNIN_SETUP.md

## Not built yet
- iOS: set list upvotes, ratings list on the profile

## Setup still needed
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
- Admin > Send a notification pushes a title and message to every phone that turned on "Station announcements" (Profile > Notifications in the app). Push through Firebase/Apple is free. People must allow notifications once; nothing needs to be pre-loaded. One send per 2 minutes. History is kept in the `broadcasts` collection.

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
