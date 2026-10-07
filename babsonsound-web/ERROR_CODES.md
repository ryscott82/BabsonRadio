# Babson Radio error codes (staff key)

Generated from `lib/error-codes.json`. Public version: `/support/errors`.
Format: `BR-<AREA>-<NNN>`. Unexpected server errors also show a `ref`: search Vercel → Logs for it.

## Signing in

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-AUTH-001 | **Wrong email or password**: Firebase rejected the email/password pair (or no such account). | Re-type both carefully, or use Forgot password. Students use the student sign-in; non-Babson emails use Guest access. | Confirm which sign-in they used. Check Firebase Console → Authentication → Users for the email. |
| BR-AUTH-002 | **Sign-in required**: The request reached the server without a valid sign-in. | Sign in and try again. | If they ARE signed in, have them sign out and in again; check the device clock. |
| BR-AUTH-003 | **Session expired**: Their sign-in token was rejected as expired or invalid. | Sign out, sign back in. | If it repeats for everyone, check FIREBASE_SERVICE_ACCOUNT_JSON belongs to the same Firebase project as the app/site config (BR-SRV-002). |
| BR-AUTH-004 | **Recent sign-in needed**: Deleting an account requires a sign-in from the last 5 minutes. | Enter your password when asked, then try deleting again right away. | — |
| BR-AUTH-005 | **Email not verified**: The action needs a verified email address. | Open the verification email, click the link, then tap 'I've verified'. Check spam. | Firebase Console → Authentication → Users shows verified status. Resend from the app or website. |
| BR-AUTH-006 | **Too many attempts**: Firebase temporarily blocked this device after repeated failures. | Wait about 15 minutes, or reset the password. | — |
| BR-AUTH-007 | **Sign-in failed (other reason)**: Firebase returned an error we don't have a specific code for. | Try again; if it repeats, send us the code and what you were doing. | Check the browser console / Xcode log for the raw Firebase error code. |
| BR-AUTH-008 | **Email sign-in is turned off**: Email/Password is not enabled in Firebase (auth/operation-not-allowed). | Nothing you can do; contact the station. | Firebase Console → Authentication → Sign-in method → enable Email/Password. |
| BR-AUTH-009 | **This website address isn't authorized**: The domain isn't in Firebase's authorized list (auth/unauthorized-domain). | Nothing you can do; contact the station. | Firebase Console → Authentication → Settings → Authorized domains → add the domain (babsonradio.com, www., and any .vercel.app). |
| BR-AUTH-010 | **Account disabled**: The account was disabled in Firebase. | Contact the station. | Firebase Console → Authentication → Users → re-enable. |

## Accounts

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-ACC-001 | **Babson email required**: Student sign-up/sign-in needs a @babson.edu address (or a guest used a Babson address). | Use your @babson.edu email for student accounts; use Guest access with any other email. | — |
| BR-ACC-002 | **Email already has an account**: An account with this email already exists. | Sign in instead, or use Forgot password. | Firebase Console → Authentication → Users. |
| BR-ACC-003 | **Phone number already registered**: Another account already uses this phone number. | Sign in to the existing account. If it isn't yours, contact the station. | Look up the number's owner via the users collection (phoneNumber). Never share it with the requester. |
| BR-ACC-004 | **Invalid phone number**: Not a valid 10-digit US number. | Enter 10 digits, e.g. (617) 555-0123. | — |
| BR-ACC-005 | **Password problem**: Password too short/long (8–128 characters) or too weak. | Use at least 8 characters. | — |
| BR-ACC-006 | **Name missing**: First name is required. | Enter your first name. | — |
| BR-ACC-007 | **Delete confirmation missing**: The delete request didn't include the confirmation. | Use the Delete my account button and enter your password. | — |
| BR-ACC-008 | **Profile not found**: The sign-in exists but its profile record is missing. | Sign out and back in. If it repeats, contact the station. | Compare Authentication → Users with Firestore users/{uid}. A failed sign-up can leave Auth without a profile; delete the Auth user so they can re-register. |
| BR-ACC-009 | **Invalid email address**: The email isn't formatted correctly. | Check for typos. | — |
| BR-ACC-017 | **Last name missing**: Sign-up needs both a first and last name. | Enter your last name. | Client validation or /api/auth/signup rejected an empty lastName. |

## Guest access

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-GST-001 | **Sponsor not found**: No verified Babson student with that email is registered. | Check the spelling; the student must have created and verified an account. | Look up users where email == sponsor email and check emailVerified in Authentication. |
| BR-GST-002 | **Sponsor is at the guest limit**: A student can sponsor up to 10 guests at once. | Ask the student to revoke an old pass. | Limit is MAX_ACTIVE_GUESTS_PER_STUDENT in lib/guest.ts. |
| BR-GST-003 | **Too many guest requests today**: Guests can send 5 sponsor requests per 24 hours. | Try again tomorrow. | — |
| BR-GST-004 | **End-of-semester not configured**: No upcoming semester-end date. | Pick 24 hours, 7 days or 30 days. | SEMESTER_END_DATES in Vercel (MM-DD,MM-DD). Defaults to 12-18,05-14 if unset. |
| BR-GST-005 | **Guest access not needed**: Students already have full access. | Sign in with your Babson account. | — |
| BR-GST-006 | **Guest trial or pass ended**: Live access has run out. | Ask a Babson student to sponsor you. | Check guestTrials/{uid} and guestPasses/{uid}. |

## Contacts & friends

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-NET-001 | **Contact sync limit reached**: Contact matching is limited to 5 times per day. | Try again tomorrow. | — |
| BR-NET-002 | **Contact data problem**: The contact list sent was empty or too large. | Update the app and try again. | Max 5000 hashes per sync. |

## Air-time requests

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-SLT-001 | **Time not allowed**: Air-time requests must start 24h–60 days ahead, 15–240 minutes long, on a 15-minute mark. | Pick a time that fits those rules. | Rules live in lib/slots.ts. |
| BR-SLT-002 | **Time already booked**: Another approved slot overlaps. | Pick a different time. | Check airSlots for the time range. |
| BR-SLT-003 | **Too many pending requests**: Limit of 3 pending requests per person. | Wait for a decision or cancel one. | — |
| BR-SLT-004 | **Request can't be changed**: It was already decided, cancelled or started. | Refresh the list. | — |
| BR-SLT-005 | **Request details missing or invalid**: Title, category, type or audio link is missing or invalid (audio links must be https and only for pre-recorded shows). | Fix the highlighted fields. | — |

## Permissions

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-PERM-001 | **Verification or permission needed**: The action requires a verified Babson account. | Verify your @babson.edu email. | — |
| BR-PERM-002 | **Staff only**: The action is limited to staff or the owner. | Ask a staff member. | — |

## Pre-launch

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-PRE-001 | **Site isn't open yet**: The website is in pre-launch mode and this request didn't include the preview password. | Babson Radio opens on October 22. Check back then. | Unlock in a browser at /coming-soon (Developer access), or send the X-Preview-Key header. iOS: set BackendConfig.previewKey. To open the site for everyone, set PRELAUNCH_OFF=1 in Vercel and redeploy. |

## Requests

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-REQ-001 | **Invalid request**: The server couldn't use what was sent. | Check the form and try again; update the app if it repeats. | — |
| BR-REQ-002 | **Not found or already handled**: The item doesn't exist or was already dealt with. | Refresh and try again. | — |
| BR-REQ-003 | **Rate limit**: Too many requests too quickly. | Wait a minute and retry. | — |

## Server / setup

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-SRV-000 | **Unexpected server error**: Something failed that we haven't classified. | Try again. If it repeats, send the code AND the 'ref' number. | Search Vercel → Logs for the ref value; the full error is printed next to it. |
| BR-SRV-001 | **Server key missing**: FIREBASE_SERVICE_ACCOUNT_JSON isn't set on the server. | Contact the station. | Vercel → Settings → Environment Variables → add it, then redeploy. Check /api/health. |
| BR-SRV-002 | **Server key malformed**: FIREBASE_SERVICE_ACCOUNT_JSON isn't valid one-line JSON or the key is wrong. | Contact the station. | Regenerate the key, convert to ONE line (json.dumps), paste with no extra quotes, redeploy. |
| BR-SRV-003 | **Server secret missing**: PHONE_HASH_PEPPER is missing or under 16 characters. | Contact the station. | Set a random 32+ character value (openssl rand -hex 32) in Vercel and redeploy. Never change it later. |
| BR-SRV-004 | **Database not created**: Firestore has no database in this Firebase project. | Contact the station. | Firebase Console → Firestore Database → Create database. |
| BR-SRV-005 | **Database index missing**: A query needs a Firestore index. | Contact the station. | firebase deploy --only firestore:indexes (or open the link in the error log). Wait until the index shows Enabled. |
| BR-SRV-006 | **Authentication not set up**: Firebase Authentication isn't initialized for the project. | Contact the station. | Firebase Console → Authentication → Get started → enable Email/Password. |
| BR-SRV-007 | **Server not allowed to use the database**: The service account lacks permission or belongs to a different project. | Contact the station. | Regenerate the key from the SAME project (babson-radio); check IAM roles (Firebase Admin SDK / Editor). |
| BR-SRV-008 | **Server couldn't reach Firebase**: Network timeout or connection failure to Google services. | Wait a minute and retry. | Check status.firebase.google.com; usually transient. |

## App & connection

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-CLI-001 | **Can't reach Babson Radio**: The device is offline or the server didn't answer. | Check your internet connection and try again. | Open https://babsonradio.com/api/health from the same device. |
| BR-CLI-002 | **App not connected to server**: The iOS app's server address isn't set. | Update the app. | BackendConfig.baseURLString must be the live site URL, no trailing slash. |
| BR-CLI-003 | **Sign-in not set up in this app build**: The iOS build is missing Firebase or GoogleService-Info.plist. | Update the app. | Add the Firebase package and a correctly named GoogleService-Info.plist to the BabsonRadio target; clean build. |
| BR-CLI-004 | **Unreadable server reply**: The server answered with something the app couldn't understand. | Update the app and retry. | Compare app and website versions; check /api/health. |
| BR-CLI-005 | **Playback couldn't start**: The stream didn't load. | Check your connection and try again. | Open the stream URL directly; check the Asura panel (source connected? bitrate/listener limit?). |
