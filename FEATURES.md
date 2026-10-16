# Babson Radio: features by role

Running document. Update it whenever a feature ships or a role changes.
Legend: [x] built, [ ] planned.

## Everyone (no account)
- [x] Listen to the live stream, see now playing, album art, next song
- [x] See the weekly schedule (28 days, week buttons)
- [x] Visualizer background on the live page
- [ ] Public mode (see PUBLIC_MODE.md)

## Listener (school email or approved tester)
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
- [x] Library opens with a Babson student's sponsor pass, or when a student has the guest's verified email in their contacts (scrambled, checked once, holds until the end of the semester and is re-checked then)
- [x] Reactions, ratings, slot requests and friends stay student-only
- [x] Interest-form links are hidden once someone is signed in, unless they are a beta tester

## Pending tester
- [x] Can create an account and see a "waiting for approval" screen
- [x] Cannot interact until approved in /admin/testers

## Show host
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
- [x] Push notifications to admin phones for reports, requests, cancellations, tester approvals and station stop/resume (setup: docs/PUSH_SETUP.md)
- [x] Listening log (/admin/listening): who listened, when, how long, which device; CSV download
- [x] Manage users and roles
- [x] Approve beta testers
- [x] Auto-scheduler rules (one genre per night option)
- [x] Auto-scheduler learns from listeners (listener counts, song and show ratings, reactions); toggle on the scheduler page
- [x] Listener Insights page (/admin/insights, directors too)
- [x] Review bug reports

## Developer
- [x] Everything an admin can do
- [ ] View-only demo account

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
