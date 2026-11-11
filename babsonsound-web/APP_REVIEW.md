# App Review: backend checklist (Nov 11, 2026)

Email and password is the only sign-in. Sign in with Apple is gone from the site and server (route `/api/auth/apple/school-email`, error codes BR-APL-001 and BR-ACC-020, and the Apple branches are removed). Guests ("Just listen for now") and in-app account deletion stay.

## 1. Before deploying
1. `firebase deploy --only firestore:rules` (still needed for the live-state document from the CPU plan).
2. Vercel env (Settings > Environment Variables): `SUPPORT_EMAIL` = a mailbox somebody reads (it appears on the public `/support` page). If unset it falls back to `CONTACT_EMAIL`, then to `hello@babsonradio.com`. Check `hello@babsonradio.com` really receives mail before relying on the fallback: it is the *sending* address today and may have no inbox.
3. Firebase console > Authentication > Sign-in method: turn **Apple** off. Keep Email/Password on.
4. Find old Apple accounts: `node --env-file=.env.local scripts/list-apple-accounts.mjs` (read-only; needs `FIREBASE_SERVICE_ACCOUNT_JSON`). For each: an account with `hasPassword=false` cannot sign in any more. Send a password reset or delete it in Authentication > Users.

## 2. Support page and reporting
- `/support` is public (signed-out, guest and locked accounts can open it). `/support/errors` is the error key. Both are linked from the footer, About, Terms and Privacy.
- Reporting uses `POST /api/feedback` (signed in, 5 per person per hour, shared with bugs and ideas). Body:
  `{ "type": "report", "message": "reason", "platform": "ios", "appVersion": "1.0", "target": { "kind": "content" | "person" | "other", "id": "optional id", "label": "what the person saw" } }`
  A report may be as short as 3 characters. Older builds that send `type: "bug"` with "[Content report]" still work. Staff see it in Admin > Bugs and ideas (filter "Reports", with an About line), as an open notice on the Admin home, and as a push to staff who turned on "reports".
- iOS: change `ProfileView.swift` send() to send `type: "report"` and a `target` instead of the "[Content report]" prefix.

## 3. Account emails (Firebase sends these, not us)
Sign-up, verification and password reset are the same for Babson and non-Babson addresses: the server creates the account, the app signs in and asks Firebase to send the verification link, and "Forgot password" asks Firebase for the reset link. Babson addresses become students, everyone else is a guest; both are on the 7-day verify clock. Our own mail (Resend) is only used for reminders, show decisions, admin and usage alerts, and the launch email.

Firebase console > Authentication > Templates, for **Email address verification** and **Password reset** (the pencil on each):
1. Sender name: `Babson Radio`.
2. From: `noreply` at your custom domain (see below). Reply-to: the support mailbox.
3. Wording: plain, in the same voice as the site ("Verify your email for Babson Radio"). Keep the `%LINK%` placeholder.
4. **Customize domain** > `babsonradio.com`. The console then shows DNS records; add them where the domain's DNS lives. They are a TXT (domain check and SPF) and CNAME records (DKIM). Verification can take up to 24 hours; when the Templates tab says "Verification complete", click **Apply Custom Domain**.
   - A domain may have only one `v=spf1` TXT record. If `babsonradio.com` already has one (for example for Resend), merge the entries into one record instead of adding a second.
   - Resend's own records (SPF/DKIM on its sending subdomain, plus MX) are separate and stay as they are.
5. Authentication > Settings > Authorized domains: `babsonradio.com` is listed.
6. Authentication > Settings > User actions: leave **Email enumeration protection** on, so the reset form never says whether an address has an account.
7. Test before submitting: sign up with a Babson address and a non-Babson address (for example a Gmail); check the verification email arrives (also spam), opens, and the app unlocks; run Forgot password for both; check the sender and the link show `babsonradio.com`.

Bulk mail (`lib/server/mailer.ts`): `sendMail(..., { bulk: true })` adds `List-Unsubscribe` (a `mailto:` to the support address). It is used for the Studio-trained invite email, which goes to people who have no account. The launch email already has the https one-click `List-Unsubscribe` plus `List-Unsubscribe-Post`. Account and security mail (verification, reset, set password, show decisions, alerts) intentionally has none.

## 4. Demo account for App Review
- It exists as `users/{uid}` with `demo: true` and `unsubscribed: true` (made by `scripts/create-account.mjs`). Create or reset it:
  `ACCOUNT_PASSWORD='choose-one' node --env-file=.env.local scripts/create-account.mjs demo review@yourdomain.com "App Review"`
  Use an address you control. It is made a student, email-verified, with nothing to set up (no About you, phone or birthday step).
- Signs in with email and password like anyone. It reaches Live, Schedule, Library, Profile, notifications and Studio screens as a student. It is not listed in Admin > People, the training list or the listening list, is never deleted by the unverified-account sweep, and is created unsubscribed so launch and bulk mail skip it.
- **Deleting it does nothing.** `POST /api/me/delete` answers `200 { ok: true, kept: true, message }` and changes nothing. The web shows the message and stays signed in. iOS: when `kept` is true, show `message` and do not sign out.
- Review Notes (paste into App Store Connect, filling in the two values):
  > Babson Radio is a student-run internet radio station. Sign-in is email and password only (no third-party login). To review: use the demo account below, or tap "Just listen for now" to listen as a guest, or create your own account with any email (a verification link is sent; you have 7 days to confirm).
  > Demo account: email `...`, password `...`. It has access to Live, Schedule, Library and Profile.
  > Account deletion: Profile > Help > Delete account (asks for your password). The demo account is protected and will show a message instead of deleting; to test deletion, create your own account first.
  > Contacts: optional, requested only after tapping Invite friends; nothing is sent unless you choose to send an invite. Notifications: optional, requested only when you turn on a notification type. Reporting: "Report" on shows and notes, and Profile > Help. Support: https://babsonradio.com/support

## 5. App Check: turn it on last
The server only enforces it on the three contacts routes, and only when `APPCHECK_ENFORCE=1`. Leave it **off** through App Review.
1. Firebase console: add the iOS app with the new bundle ID `com.babsonradio.app` (Project settings > Your apps), download its new `GoogleService-Info.plist` into Xcode, and enter the new **Team ID** there (needed for App Attest and for the APNs key).
2. Firebase console > App Check > Apps > the new iOS app > register with **App Attest**. Add debug tokens for simulator and Debug builds (App Check > Manage debug tokens).
3. Xcode: change `DEVELOPMENT_TEAM` from the old team to the new Team ID (target and project). Add the **FirebaseAppCheck** product to the app target (it is **not** added yet: until it is, the app sends no token and enforcing would block contacts for everyone). The App Attest entitlement is already in `BabsonRadio.entitlements` (`production`).
4. Re-upload the APNs key (.p8) from the new team in Firebase > Project settings > Cloud Messaging.
5. Build a Release/TestFlight build and test on a **real iPhone** (App Attest does not run in the simulator): sign in, Profile > Invite friends > allow contacts, check matches load.
6. Test enforcement on a Vercel **Preview** deployment first: set `APPCHECK_ENFORCE=1` for Preview only, point a TestFlight build at it, repeat step 5; then try the same call with no token (curl) and expect `403 BR-ACC-024`.
7. After App Review passes and the build is live, set `APPCHECK_ENFORCE=1` in Production and redeploy. If real students get BR-ACC-024, clear the variable (that switches it off at once) and check the App Attest registration and Team ID.

## 6. Server readiness
Nothing from the CPU plan is live unless it has been deployed: check Vercel before submitting (see the report in the project, `claude/backend_submission_report.md`).
