# iOS update: real sign-in, developer profiles, "Go On Air" tab

## 1. Install the code
Unzip next to `BabsonRadio.xcodeproj` (so you have `apply.py` and an `ios/` folder beside it), then in Terminal:

    cd /Users/ryan/Documents/BabsonRadio
    python3 apply.py

It checks everything first and changes nothing if your files differ from what it expects. Backups go in `_ios_backup/`.
Then close and reopen the project in Xcode.

## 2. Add Firebase to the app (about 5 minutes — this is the part I can't do for you)
1. Xcode → File → Add Package Dependencies → `https://github.com/firebase/firebase-ios-sdk` → add **FirebaseAuth** to the BabsonRadio target.
2. Firebase console → Project settings → Your apps → Add app → iOS. Bundle ID: `com.ryanscottpersonalteam.BabsonRadio`.
3. Download `GoogleService-Info.plist`, drag it into the BabsonRadio group in Xcode, and tick the BabsonRadio target.
4. Firebase console → Authentication → make sure **Email/Password** is enabled.

The code is written so the app still builds before step 2; sign-in just says Firebase isn't set up yet.

## 3. Connect the app to the server
The app talks to the website's `/api` routes. Deploy the website (Vercel is the simplest), add the env vars from `.env.example`,
then set `baseURLString` in `BackendConfig.swift` to the deployed address. A phone can't reach `localhost`.

## 4. Backend (already in your website folder)
- Review and deploy the rules: `firebase deploy --only firestore:rules` (replaces live rules — read `firestore.rules` first).
- Create your developer account (no babson.edu email or phone needed):

      cd babsonsound-web
      node --env-file=.env.local scripts/create-developer.mjs you@example.com "Ryan"

  It prints a password once. Sign in on the phone with the hidden panel (tap the blank strip under the sign-in form 5 times).
  On the website, developers sign in at `/auth/dev` and review requests at `/admin/slots`.

## 5. Try it
1. Student: create an account, verify the email, open **Go On Air**, request a slot (>24h ahead).
2. Staff: `/admin/slots` → approve (add live-stream details) → the student sees it, with the details, in the app.
3. Try requesting an overlapping time: it should be refused.

## Known limits
- Pre-recorded shows use a link to the audio (Drive/Dropbox), not an in-app upload. Direct upload needs Firebase Storage.
- Live shows: staff paste the connection details for the requester by hand; nothing creates streamer accounts on the Asura panel automatically.
- Requesters aren't notified by push/email yet; they see the answer in the app.
- Cancelling a guest invite in the Profile tab only clears it from the screen (no server revoke for pending invites yet).
- Swift code was not compiled here (no Xcode available) — expect to fix a small error or two on first build.
