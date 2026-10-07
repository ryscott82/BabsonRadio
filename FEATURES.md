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
- [x] Live reactions (🔥 ❤️ 🎉 👏)
- [x] Upvote songs in a host's set list
- [x] Rate an episode (1 to 5 stars)
- [x] See the message a host pinned for the show
- [x] Profile: concentration and year
- [x] Request a show slot
- [x] Contact William (signed in only)
- [x] Send bug reports and ideas
- [ ] Email reminders (needs a sender such as Resend)

## Guest / pending tester
- [x] Can create an account and see a "waiting for approval" screen
- [x] Cannot interact until approved in /admin/testers

## Show host
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
- [x] Station controls: skip song, emergency stop, resume (/admin/controls)
- [x] Manage users and roles
- [x] Approve beta testers
- [x] Auto-scheduler rules (one genre per night option)
- [x] Review bug reports

## Developer
- [x] Everything an admin can do
- [ ] View-only demo account

## Setup still needed
- Set AZURACAST_URL, AZURACAST_API_KEY, AZURACAST_STATION_ID in Vercel
- firebase deploy --only firestore:rules
- Controls endpoints are untested against a real AzuraCast server
