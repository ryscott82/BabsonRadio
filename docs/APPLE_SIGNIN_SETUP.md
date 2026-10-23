# Sign in with Apple, school email and birthday: one-time setup

The code is built (iOS and website server). These steps are yours, in this order. Until they are done the Apple button shows an error, and email sign-in keeps working.

## What people see
1. After the launch splash, signed-out people see the sign-in splash: **Continue with Apple**, **Continue with email**, and a small "Just listen for now".
2. Apple sign-in, then **Add your school email** (Babson, Olin or Wellesley). That address becomes the account's email, a verification link is sent to it, and they have **7 days** to open it. After 7 days they are held on the verify screen until they do.
3. Then **About you**: first and last name, phone, graduation year, and a **birthday**. A small "use age range instead" link swaps the birthday for Under 13 / 13-17 / 18-24 / 25+.
   - Under 13: nothing is kept. The account is deleted right away.
   - 13 to 17: a parent or guardian box must be ticked.
   - The birthday or range is saved encrypted. Only a plain yes/no "minor" flag is stored readable.
   - Shown once per account (existing student accounts see it once after updating). Guests (non-school email accounts) are not asked yet.

New email sign-ups now also get 7 days (was 3) before they must click the verification link. Accounts made before this keep the 3 days they were given.

## Steps
1. **Website server (Vercel)**: add `PII_KEY` = output of `openssl rand -base64 32`. Keep a copy somewhere safe: without it saved birthdays can't be read. Then deploy. Until PII_KEY exists the About you step fails with code BR-SRV-009.
2. **Apple Developer**: your App ID needs the Sign in with Apple capability (Xcode adds it for you in the next step). Needs the paid program.
3. **Xcode**: target BabsonRadio, Signing & Capabilities, **+ Capability**, **Sign in with Apple**.
4. **Firebase console**: Authentication, Sign-in method, **Apple**, turn it on. For deleting Apple accounts, Firebase also needs the Apple key: in that same Apple settings box, open the code flow configuration and enter your Apple Team ID, a Key ID and the .p8 private key (Apple Developer, Keys, new key with Sign in with Apple ticked). This is what lets "Delete my account" revoke the Apple link, which Apple requires.
5. **Firebase iOS package**: needs version 10.24 or newer (Account deletion calls `revokeToken`). Update in Xcode, File, Packages, Update to Latest Package Versions.
6. **Test on a real iPhone** (Apple sign-in does not work in some simulators): Apple button, add school email, check the link arrives, About you with a birthday, then relaunch. Then try "use age range instead", and a 13-17 range (parent box appears). Last, Profile, Delete my account, confirm with Apple.

## Notes
- Apple "Hide My Email" is fine: the Apple address is replaced by the school email.
- Apple only gives the name the first time. If it is missing, About you asks for it.
- Before launch, an Apple sign-in with a school email can finish sign-up like any other account, but it sees the waiting screen until the site opens (or the account is a beta tester / has early access).
- Error codes: BR-AGE-001 (under 13), BR-AGE-002 (parent box), BR-AGE-003 (birthday), BR-APL-001 (not an Apple account), BR-SRV-009 (PII_KEY missing). Keys are in `/support/errors`.
