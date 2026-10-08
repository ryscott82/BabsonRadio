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
- [x] "Saved by N members" suggestions: on by default; the phone's contacts prompt appears the first time a student opens the app; Invisible mode is the opt-out (also turns off live reactions and friend activity). Scrambled numbers only, shown only when 3+ other members saved the number, never who. Costs one Firestore write per sync; counts rebuild once a day (iOS)
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

## Not built yet
- iOS: set list upvotes, ratings list on the profile

## Setup still needed
- Optional: Firestore TTL policies on `exp` for collection groups `rxEvents` (reaction events, 1 day) and `listenSessions` (listening log, 1 year)
- Add the listening log to the privacy policy before launch
- Shared-contact suggestions need `PHONE_HASH_PEPPER` set in Vercel (already used for contact matching), and App Store privacy answers should list Contacts as collected (phone numbers, scrambled, linked to the account, used for app functionality)
- Set AZURACAST_URL, AZURACAST_API_KEY, AZURACAST_STATION_ID in Vercel
- firebase deploy --only firestore:rules
- Controls endpoints are untested against a real AzuraCast server
