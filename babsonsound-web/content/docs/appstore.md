# App Store submission

Status as of Nov 11, 2026: the app code is ready for a first build (commit `a7ef6a4`). Waiting on App Store Connect access, the Vercel pause (the site must be up during review), and a real-iPhone test pass. Review checklist for the website side: see "App Review checklist".

## The Apple account

- It is an **Individual** Apple Developer account made by Babson's Office of Student Engagement (OSE). It is under Gus's name; Gus pays for it. Ryan holds the Apple ID, password and 2FA and does the work.
- The App Store shows the seller name as the personal name on the account. That is accepted.
- **Renewal.** The membership renews yearly ($99). If it is paid with a one-time card number, the next charge will fail and the app can be removed from sale. Ask Gus how it is paid, turn auto-renew off if needed and renew by hand each year, and set a reminder 60 days before the renewal date.
- **Handover before Ryan graduates (spring 2027).** Move the Apple ID credentials and 2FA to something OSE controls (an office phone number, a shared password vault), name the next person, and record where the APNs key (.p8) is stored.
- **Individual accounts have no team members.** People added in App Store Connect get access to the app only, not to certificates, identifiers or keys. So the Account Holder (Ryan, using the OSE Apple ID) does the signing and key steps.

## Moving the app to another account later

Allowed, and it does not take the app offline for people who already installed it. Apple keeps the app on the store during the transfer, keeps the bundle ID, reviews and ratings, and users keep getting updates. Needs: at least one released version, both Account Holders agreeing, TestFlight switched off first (remove builds and testers), the app not in review. After a transfer: upload a new APNs key (new team) to Firebase, re-register App Check/App Attest with the new Team ID and test on a real iPhone before enforcing it, and make new signing certificates. Never change the bundle ID after release.

Converting an Individual account into an Organization is possible but unreliable: developers report the seller name staying personal.

## Decisions

- Bundle ID: `com.babsonradio.app` (cannot be changed once the app record exists).
- Our own email and password only. **Sign in with Apple is removed** (Guideline 4.8 only applies to apps that offer another company's login). Keep guest listening ("Just listen for now") and in-app account deletion.
- iPhone only for 1.0 (no iPad screenshots or iPad testing needed).
- Domain: babsonradio.com for the site, support and privacy URLs and email.
- Do not submit for review until the CPU fix is deployed and the site is stable.

## What is built in the app

- Sign in with Apple removed; entitlements file with push and App Attest; `PrivacyInfo.xcprivacy`; `ITSAppUsesNonExemptEncryption = NO`; deployment target 18.6; version 1.0 build 1.
- Our own explanation screens before the Contacts and notification prompts. Texts and invites only after tapping a person.
- Report on the pinned note and show pages; Help links in Profile (Privacy, Terms, Support, Delete account, Contact the station).
- Still to do in the app: send reports as `type: "report"` with `target` (the route exists; the app still uses the old "[Content report]" prefix), add the FirebaseAppCheck package and test it, show the demo account's delete message.

## What Apple checks (and our status)

| Area | Guideline | Status |
|---|---|---|
| The live site works during review | 2.1(a) | Blocked while the Vercel pause lasts |
| Demo account in Review Notes | 2.1(a) | Built (hidden demo student; deleting it is a no-op). Needs its login in Review Notes |
| Login not required for core features | 5.1.1(v) | Guest mode exists |
| Account deletion in the app | 5.1.1(v) | Built; test on a real iPhone |
| Contacts | 5.1.1(iii), 5.1.2(iv), (v) | Explanation screen, optional, hashed numbers. Highest-risk item: describe it plainly in Review Notes |
| Phone, birthday | 5.1.1(iii), (x) | Optional, encrypted, skippable |
| User-generated content | 1.2 | Word filter, report action, published contact. No block-a-person route (nothing shows one listener to another). Server word filter still missing on slot and host-update requests and on the Instagram handle |
| Push | 4.5.4, 5.1.2(i) | Opt-in, never required |
| Privacy policy and support URL | 5.1.1(i), 1.5 | `/privacy` and `/support` exist |
| Age rating, minors | 2.3.6, 5.1.4 | 13+, under 13 deleted, parent box 13 to 17 |
| Music rights | 5.2 | ASCAP and BMI covered. SESAC, GMR and SoundExchange still open with Babson Legal |

## Privacy answers (must match the privacy policy)

Collected: name, email, phone number, contacts (scrambled numbers), user ID, other user content (reactions, ratings, bug reports), other usage data (app functionality, analytics), other data (birthday range, Instagram handle). All linked to the person. No tracking, no ads, no third-party advertising. Required-reason API in the manifest: UserDefaults (CA92.1).

## Steps left (in order)

1. Developer account: confirm Membership is active and Individual, accept agreements, note the renewal date and who pays.
2. Developer portal: App ID `com.babsonradio.app` with Push and App Attest. Create the APNs key (.p8, one download) and upload it to Firebase > Project settings > Cloud Messaging with Key ID and Team ID.
3. Firebase: iOS app for `com.babsonradio.app` (done), turn off the Apple sign-in provider, set the custom email domain.
4. App Store Connect: accept the Free Apps agreement; create the app record (name, bundle ID, SKU, Music category, free, US availability).
5. Xcode: team = the OSE account, register a test iPhone, Product > Archive > Distribute > App Store Connect.
6. TestFlight: test on a real iPhone: sign-up, sign-in, forgot password, verify email, About you, guest listening, play and background audio, lock-screen controls, notifications opt-in, Contacts screen, report, delete account, airplane mode.
7. Metadata: icon (1024, no transparency), 6.9-inch iPhone screenshots, description, keywords, support URL `babsonradio.com/support`, privacy URL `babsonradio.com/privacy`, age rating, privacy answers, review contact (a phone that is answered), Review Notes, manual release.
8. Turn on `APPCHECK_ENFORCE` only after a real-device test, first on a Vercel Preview.

## Questions that stay open

- Who pays the renewal, and how.
- Who takes over the Apple account after Ryan graduates.
- The shared mailbox for Apple's messages.
