# Auth, guest access & contacts network

## Env (see .env.example)
`FIREBASE_SERVICE_ACCOUNT_JSON`, `PHONE_HASH_PEPPER`, `SEMESTER_END_DATES`.
Firebase console → Authentication: enable **Email/Password** only (Email link / passwordless stays off), and add your
site's domain under Settings → Authorized domains.

## Who gets in
- **Member** = verified `@babson.edu` email, OR a guest with a non-revoked, unexpired `guestPasses/{uid}`.
- Enforced in `firestore.rules`, not just the UI. Unverified or non-Babson accounts can be created directly
  against Firebase, but they can read nothing locked.

## Guest flow
1. Guest signs up at `/auth` with email and password (the verification email proves the address).
2. Once signed in → `POST /api/guest/claim` (redeems a pre-approved invite) else `POST /api/guest/request`.
3. Sponsor → `/guest-access`: approve (24h / 7d / 30d / end of semester) or deny. Duration is computed server-side.
   Students can also invite by email (`/api/guest/invite`); that pass starts when the guest signs in.
4. Sponsor can revoke any time. Max 10 active guests per student.

## Contacts network (iOS → `POST /api/contacts/match`)
Authorization: `Bearer <Firebase ID token>`. Body `{ "hashes": ["<64 hex>", ...] }` (≤ 5000). iOS also sends `X-Firebase-AppCheck`
(required when `APPCHECK_ENFORCE=1`).

Per contact phone number:
1. Digits only; if 11 digits starting with `1`, drop the leading `1`; must be 10 digits, first digit 2–9.
2. E.164: `"+1" + digits`  (e.g. `+16175551234`)
3. `hash = lowercase hex( SHA-256( UTF-8 bytes of the E.164 string ) )`

Response: `{ matched: [{ hash, mutual }], capped }`. It names nobody: no uid, no first name. The app already knows which of its own contacts
each hash belongs to. Edges are stored at `users/{uid}/connections/{otherUid}` (`mutual: true` once both sides have each other's number);
a repeat sync of the same people writes nothing. Unmatched hashes are discarded, never stored. Server keys its index with HMAC(pepper, hash),
so a database leak alone doesn't reveal phone numbers.

Why it can't be used as a reverse phone lookup (`lib/contactLimits.ts`, `lib/server/contactSync.ts`):
- Only a **verified** school email (`email_verified`), not the 7-day grace (BR-CON-004). App Check on iOS.
- One full sync a day per route (`/match` and `/popular` each; BR-CON-005 / BR-CON-003).
- A cap on **new** distinct numbers per rolling 30 days (5,000). `contactSyncs/{uid}.seen` is one string of 20 characters per number: 16 hex
  characters (8 bytes of an HMAC of the hash) plus 4 base-36 characters for the day it was first sent. Re-syncing the same contacts adds nothing;
  a sweep of arbitrary numbers hits the cap and the rest is ignored. One read and one write per sync.
- A sync with 500+ matches, or 70%+ of 300+ numbers matching, is treated as a scrape: nothing is returned, `contactSyncs/{uid}.flagged` is set,
  the account's syncing stays paused (BR-CON-007) and an admin notification appears. Settings → Phone lookup → Paused accounts → Clear.

### Names from your own contacts (`POST /api/contacts/labels`)
Body `{ labels: [{ hash, name }] }` (≤ 300), for contacts that **matched a member** only. The name is stored encrypted (`PII_KEY`) at
`users/{me}/connections/{them}.contactName`; hashes that are not one of the caller's contact connections are ignored. `visibleFriends` and
`visibleFriendProfiles` (presence, likes) return the caller's own `contactName` for each friend, or the first name when there is none. It is read
from the caller's own connection doc, so one member's label never reaches another. The admin friends map reads account names and is unchanged.

### Required iOS change
`NSContactsUsageDescription` currently says contacts are "never uploaded or stored". Update it, e.g.:
> "Babson Radio finds friends who are already on the app. Contact phone numbers are hashed on your device and
> checked against registered users; numbers that don't match are discarded."
and update the App Store privacy "nutrition label" (Contacts → linked to user, used for app functionality).

## How a member's own number is stored (students only)
`users/{uid}` holds three fields and no plain-text copy: `phoneEncrypted` (AES-256-GCM, `PII_KEY`; read back only on the owner's own
phone page and the admin phone-change flow), `phoneHash` (HMAC-SHA256 with `PHONE_HASH_PEPPER` over the SHA-256 of the E.164 number,
the same value as the `phoneIndex` document id) and `phoneVerified` (`false` until a verification step exists; there is none yet).
`phoneIndex/{phoneHash}` is the unique index: `{ uid, verified: false }`. Contact matching (`/api/contacts/match`, `/popular`) runs on
every entry, verified or not, because SMS verification may never be added; `verified` is stored so it can be used later. Guests never have a phone. Removing the number deletes all three
fields and the index entry. Babson's own lines (`BLOCKED_NUMBER_PREFIXES`, 781-239) are refused as a member's number (BR-SET-009) and
their hashes are dropped from contact uploads on the server. Older accounts may still have a plain `phoneNumber`; it is read as a
fallback and replaced on the next save or removal.

## Known gaps
- Phone numbers aren't SMS-verified (by choice), so someone can register a number that isn't theirs.
- Locked-content gating protects Firestore docs, not the media files themselves.
- Guests learn nothing until a sponsor acts; there's no email/push notification to the sponsor yet.

## Access tiers (current model)

| Who | Live radio | Stored episodes |
|---|---|---|
| Student (verified @babson.edu) | yes | yes |
| Developer (`developer` claim) | yes | yes |
| Guest, first 3 days after sign-up (automatic trial) | yes | **never** |
| Guest with a student-sponsored pass (24h / 7d / 30d / semester) | yes, until it ends | **never** |

- Guests sign up with email + password (free Firebase Auth; no SMS, no email links). The trial starts on first sign-in; verifying the email is only needed before asking a student to sponsor.
- `GET /api/guest/status` reports `canListenLive` / `canAccessBacklog`. Episodes are protected by Firestore rules (`isMember()` = students + developers), not just the UI.
- The live stream URL itself is public, so live gating is in the apps' UI.
- Phone numbers are only used for the contacts network, never for access, so SMS verification can be dropped without breaking anything.
