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
- [x] Live reactions (🔥 ❤️ 🎉 👏): a handful rain down on your screen, and one falls on everyone else's screen for each reaction (web and iOS)
- [x] Upvote songs in a host's set list
- [x] Rate the song that is playing (1 to 5 stars), saved per song
- [x] Rate a whole show or hour of music (1 to 5 stars), saved per show
- [x] See everything you rated on your profile (web)
- [x] See the message a host pinned for the show
- [x] Profile: concentration and year
- [x] Request a show slot
- [x] Contact William (signed in only)
- [x] Station-wide message banner (website and app), closable on the site
- [x] Password reset limited to one email every 3 minutes (website and app)
- [x] Send bug reports and ideas
- [ ] Email reminders (needs a sender such as Resend)

## Guest / pending tester
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
- Set AZURACAST_URL, AZURACAST_API_KEY, AZURACAST_STATION_ID in Vercel
- firebase deploy --only firestore:rules
- Controls endpoints are untested against a real AzuraCast server
