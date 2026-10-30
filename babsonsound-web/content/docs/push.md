# Admin push notifications: one-time setup

The code is in place. Push needs a few things only you can do, in this order. Without them the app still builds and the toggles say push is not set up.

1. **Apple key.** developer.apple.com, Certificates, Identifiers & Profiles, Keys, add a key with "Apple Push Notifications service (APNs)" ticked. Download the `.p8` file (you only get one download). Note the Key ID, and your Team ID (Membership page).
2. **Upload it to Firebase.** Firebase console, Project settings, Cloud Messaging, "Apple app configuration", upload the `.p8` with the Key ID and Team ID.
3. **Xcode, add the library.** Target BabsonRadio, General, Frameworks, Libraries and Embedded Content, plus button, choose `FirebaseMessaging` (the firebase-ios-sdk package is already added).
4. **Xcode, add the capabilities.** Target, Signing & Capabilities, plus button: "Push Notifications", and "Background Modes" with "Remote notifications" ticked.
5. **Google Cloud.** console.cloud.google.com, same project, APIs & Services, make sure "Firebase Cloud Messaging API" is enabled (it usually already is).
6. **Try it on a real iPhone** (not the simulator). Profile, Admin, Notifications: switch a kind on and allow notifications. Then send a bug report from another account and your phone should buzz within a few seconds.

Which events push: new bug reports and ideas, show requests and change requests, cancelled shows, beta testers waiting for approval, and the station being stopped or resumed by another admin. Each phone picks its own kinds. You never get a push for something you did yourself.

Cost: Firebase Cloud Messaging is free.
