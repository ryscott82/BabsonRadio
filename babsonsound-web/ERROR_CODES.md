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
| BR-AUTH-011 | **Signed in, profile did not load**: The app signed in with Firebase but could not load the account from the server. | Close and reopen the app, then try again. | Check /api/health and the Vercel logs for /api/me. The app must send X-Preview-Key while the site is locked. |
| BR-AUTH-012 | **Firebase rejected the developer sign-in**: The server accepted the password but Firebase would not sign the app in with the token. | Try again in a minute. | The iOS GoogleService-Info.plist and the web/server Firebase project must be the same project (babson-radio). Check Authentication is enabled. |

## Accounts

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-ACC-001 | **Babson email required**: Student sign-up/sign-in needs a @babson.edu address (or a guest used a Babson address). | Use your @babson.edu email for student accounts; use Guest access with any other email. | — |
| BR-ACC-002 | **Email already has an account**: An account with this email already exists. | Sign in instead, or use Forgot password. | Firebase Console → Authentication → Users. |
| BR-ACC-003 | **Phone number already registered**: Another account already uses this phone number. | Sign in to the existing account. If it isn't yours, contact the station. | The number is stored encrypted, so you cannot search for it. The phoneIndex document id is the phoneHash of the owning account (its uid is inside). Never share who it is with the requester. |
| BR-ACC-004 | **Invalid phone number**: Not a valid 10-digit US number. | Enter 10 digits, e.g. (617) 555-0123. | — |
| BR-ACC-005 | **Password problem**: Password too short/long (8–128 characters) or too weak. | Use at least 8 characters. | — |
| BR-ACC-006 | **Name missing**: First name is required. | Enter your first name. | — |
| BR-ACC-007 | **Delete confirmation missing**: The delete request didn't include the confirmation. | Use the Delete my account button and enter your password. | — |
| BR-ACC-008 | **Profile not found**: The sign-in exists but its profile record is missing. | Sign out and back in. If it repeats, contact the station. | Compare Authentication → Users with Firestore users/{uid}. A failed sign-up can leave Auth without a profile; delete the Auth user so they can re-register. |
| BR-ACC-009 | **Invalid email address**: The email isn't formatted correctly. | Check for typos. | — |
| BR-ACC-017 | **Last name missing**: Sign-up needs both a first and last name. | Enter your last name. | No longer used: sign-up does not ask for a last name. |
| BR-ACC-018 | **Graduation year missing**: Sign-up needs a graduation year (or Alumni / Faculty or staff). | Pick your graduation year from the list and try again. | No longer used at sign-up. Graduation year is optional and asked later in About you. |
| BR-ACC-019 | **Terms not accepted**: Creating an account requires agreeing to the Terms of Use and Privacy Policy. | Tick the box that says you agree to the Terms of Use and Privacy Policy, then try again. | None needed. Acceptance time and version are saved on the user's profile (termsAcceptedAt, termsVersion). |

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
| BR-PRE-001 | **Site isn't open yet**: Babson Radio is not open yet and this request had no launch pass. | Babson Radio opens on October 30 at 10 am Eastern. Check back then. | Admins, Directors and Radio trained students get a pass automatically after signing in (POST /api/launch/pass). To open the site for everyone now, set LAUNCH_OPEN=1 in Vercel and redeploy. |
| BR-PRE-003 | **Account is waiting for launch**: The account is ready, but Babson Radio is not open to it yet. Before the launch time only Admins, Directors and Radio trained students get in. | Come back when Babson Radio opens on October 30 at 10 am Eastern. | The site opens by itself at LAUNCH_AT (default 2026-10-30T14:00:00Z). To let one person in early, give them the Radio trained badge in People and roles. To open everyone now: set LAUNCH_OPEN=1 in Vercel and redeploy (Preview builds only for rehearsals). |
| BR-PRE-004 | **Launch lock isn't set up**: The server has no LAUNCH_SECRET (or CRON_SECRET) to sign launch passes with, so nobody can be let in early. | Tell the station team. | Set LAUNCH_SECRET in Vercel (openssl rand -hex 24) and redeploy. |

## Unsubscribe

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-UNS-001 | **Unsubscribe link didn't work**: The unsubscribe link is damaged, or the account no longer exists. | Open the link again from the email. If it still fails, reply to the email and we will remove you. | Tokens are signed with LAUNCH_SECRET. If that was changed, old links stop working. |

## Launch email

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-LCH-001 | **Launch email isn't set up**: RESEND_API_KEY or LAUNCH_SECRET is missing on the server. |  | Set RESEND_API_KEY, MAIL_FROM and LAUNCH_SECRET in Vercel and redeploy. |
| BR-LCH-002 | **Launch test email was refused**: Resend did not accept the test email. |  | Read the reason in the error. Common: the sending domain is not verified in Resend, or the free plan's daily limit is used up. |

## Age and birthday

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-AGE-001 | **Under 13**: The birthday or age range says the person is under 13. Babson Radio keeps no data about under-13s, so the account and everything on it was deleted. | Babson Radio is for people 13 and older. | Nothing is kept. Check the Firebase user is gone if the person disputes it. |
| BR-AGE-002 | **Parent or guardian OK needed**: People 13 to 17 must confirm a parent or guardian agrees to them using Babson Radio. | Tick the parent or guardian box, then continue. | None needed. The answer is saved as parentalConsent on the user's profile. |
| BR-AGE-003 | **Birthday or age range missing or not valid**: The birthday was not a real past date, or neither a birthday nor an age range was sent. | Pick your birthday, or tap 'use age range instead' and pick a range. | None needed. The app blocks this before the server is called. |

## Account setup

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-SET-001 | **Unknown setup step**: The app asked about a setup step that does not exist. | Update the app and try again. | Valid steps: verifyEmail, name, avatar, birthday, gradYear, phone (lib/setup.ts). An old or modified client can send something else. |
| BR-SET-002 | **Step not part of this account**: The step does not apply to this kind of account. Graduation year and phone number are for students only; Guests never get them. | Nothing to do. Skip it. | Guests have no gradYear or phone step; if a Guest sees one, the app is out of date. |
| BR-SET-003 | **This step cannot be skipped**: The email step is required and cannot be skipped. | Open the link in your verification email. | Only verifyEmail is required. Its deadline is emailDeadlineAt in the setup block of /api/me. |
| BR-SET-004 | **Month and day needed**: The birth year sits on the 13 or 18 line, so the year alone cannot tell whether the person is old enough or an adult. | Add your month and day. | Only happens for a year-only birthday in the cutoff years. Nothing was saved. |
| BR-SET-005 | **Phone number already on the account**: A number is already saved. Changing it needs an admin to approve it. | Use Profile > Phone number to ask for a change. | Changes go through /api/me/phone and Admin > Phone changes. |
| BR-SET-006 | **Finish this step from your email**: The email step is completed by opening the verification link, not by saving a value. | Open the link in your verification email, then check again. Look in spam. | Firebase Console > Authentication > Users shows verified status. The app resends with sendEmailVerification. |
| BR-SET-007 | **First name missing**: The name step needs a first name. | Enter your first name. | — |
| BR-SET-008 | **Avatar color not valid**: The color is not one of the profile colors. | Pick one of the colors shown. | Valid ids are in lib/profile.ts (AVATAR_COLORS). |
| BR-SET-009 | **Babson campus line**: The number is one of Babson's own lines (781-239), not a personal number. Nothing was saved. | Enter your own mobile number, or skip this step. | The blocked prefixes are BLOCKED_NUMBER_PREFIXES in lib/phone.ts (kept in step with blockedNumberPrefixes in ProfileView.swift). Contact lists drop these hashes too. |

## Sign in with Apple

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-APL-001 | **Not an Apple sign-in**: This step is only for accounts that signed in with Apple. | Sign out and sign in with Apple, or use the email sign-in. | Firebase Console → Authentication → Users: check the provider column shows Apple. |

## Host training

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-TRN-001 | **Training required**: A student tried to request a slot without being certified. | Take the host quiz at /training, or request in-person training. | Admin > Training shows who is certified. Directors can certify by hand. |
| BR-TRN-002 | **Quiz retried too fast**: A second quiz attempt came within 20 seconds of the last. | Read the explanations, then try again. | — |
| BR-TRN-003 | **Quiz not finished**: Some questions were left blank. | Answer every question before submitting. | — |

## Conduct agreements

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-CON-001 | **Conduct agreement not signed**: The conduct agreement needs every box ticked and a typed full name. | Tick every box and type your first and last name. | Signed records are in conductConsents (kind=conduct). |
| BR-CON-002 | **Clean-hours pledge not signed**: A slot that overlaps 6 AM to 10 PM Eastern needs the signed clean-hours pledge. | Sign the pledge, or pick a time outside the clean hours. | Signed records are in conductConsents (kind=clean); the request stores cleanPledgeId. |

## Public sharing

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-PUB-001 | **Public sharing blocked: someone under 18**: A host or person in this content is under 18, so it cannot be made public. This is a minor-safety rule and cannot be overridden. | Leave it as students-only. Nothing else is needed. | Do not set visibility to public by hand for content with any under-18 host. |
| BR-PUB-002 | **Age not on file**: A host has not given a birthday or age range yet, so we cannot confirm they are 18 or older. | Open your profile and add your birthday or age range, then try again. | The user's profile needs onboardedAt and minor=false. |
| BR-PUB-003 | **No known host**: The episode has no linked host account, so ages cannot be checked. | Ask staff to add the host's school email to the episode. | Set hostUids on the episode (host emails in Admin > Library content). |
| BR-PUB-004 | **Signature incomplete**: Public sharing needs every box ticked and a full name typed. | Tick all the boxes and type your first and last name. | The signed record is saved in publicConsents with the agreement version and time. |
| BR-PUB-005 | **Not your episode**: Only the host named on an episode can sign to make it public. | Ask the host to do it from their Host page. | Check hostUids on the episode. |

## Operations

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-OPS-001 | **Pick a date range**: The play log or another report needs a valid start and end date. | Choose both dates (end on or after start). | — |
| BR-OPS-002 | **Date range too long**: The play log is limited to 93 days at a time. | Export in smaller chunks. | — |

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
| BR-SRV-009 | **Encryption key missing**: PII_KEY isn't set on the server, so birthdays and age ranges can't be stored encrypted. | Contact the station. | Vercel → Settings → Environment Variables → add PII_KEY (run: openssl rand -base64 32), then redeploy. Keep a copy: without it saved birthdays can't be read. |

## App & connection

| Code | What it is | What the user should do | What staff check |
|---|---|---|---|
| BR-CLI-001 | **Can't reach Babson Radio**: The device is offline or the server didn't answer. | Check your internet connection and try again. | Open https://babsonradio.com/api/health from the same device. |
| BR-CLI-002 | **App not connected to server**: The iOS app's server address isn't set. | Update the app. | BackendConfig.baseURLString must be the live site URL, no trailing slash. |
| BR-CLI-003 | **Sign-in not set up in this app build**: The iOS build is missing Firebase or GoogleService-Info.plist. | Update the app. | Add the Firebase package and a correctly named GoogleService-Info.plist to the BabsonRadio target; clean build. |
| BR-CLI-004 | **Unreadable server reply**: The server answered with something the app couldn't understand. | Update the app and retry. | Compare app and website versions; check /api/health. |
| BR-CLI-005 | **Playback couldn't start**: The stream didn't load. | Check your connection and try again. | Open the stream URL directly; check the Asura panel (source connected? bitrate/listener limit?). |
