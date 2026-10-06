# Auth, guest access & contacts network

## Env (see .env.example)
`FIREBASE_SERVICE_ACCOUNT_JSON`, `PHONE_HASH_PEPPER`, `SEMESTER_END_DATES`.
Firebase console → Authentication: enable **Email/Password** and **Email link (passwordless)**, and add your
site's domain under Settings → Authorized domains.

## Who gets in
- **Member** = verified `@babson.edu` email, OR a guest with a non-revoked, unexpired `guestPasses/{uid}`.
- Enforced in `firestore.rules`, not just the UI. Unverified or non-Babson accounts can be created directly
  against Firebase, but they can read nothing locked.

## Guest flow
1. Guest → `/auth/guest`: name, email, (sponsor's babson email) → Firebase emails a sign-in link (proves the email).
2. Link opens `/auth/guest` → `POST /api/guest/claim` (redeems a pre-approved invite) else `POST /api/guest/request`.
3. Sponsor → `/guest-access`: approve (24h / 7d / 30d / end of semester) or deny. Duration is computed server-side.
   Students can also invite by email (`/api/guest/invite`); that pass starts when the guest signs in.
4. Sponsor can revoke any time. Max 10 active guests per student.

## Contacts network (iOS → `POST /api/contacts/match`)
Authorization: `Bearer <Firebase ID token>`. Body `{ "hashes": ["<64 hex>", ...] }` (≤ 5000, ≤ 5 syncs/day).

Per contact phone number:
1. Digits only; if 11 digits starting with `1`, drop the leading `1`; must be 10 digits, first digit 2–9.
2. E.164: `"+1" + digits`  (e.g. `+16175551234`)
3. `hash = lowercase hex( SHA-256( UTF-8 bytes of the E.164 string ) )`

Response: `{ matched, people: [{ uid, firstName, mutual }] }`. Edges are stored at
`users/{uid}/connections/{otherUid}` (`mutual: true` once both sides have each other's number).
Unmatched hashes are discarded, never stored. Server keys its index with HMAC(pepper, hash), so a database
leak alone doesn't reveal phone numbers.

### Required iOS change
`NSContactsUsageDescription` currently says contacts are "never uploaded or stored". Update it, e.g.:
> "Babson Radio finds friends who are already on the app. Contact phone numbers are hashed on your device and
> checked against registered users; numbers that don't match are discarded."
and update the App Store privacy "nutrition label" (Contacts → linked to user, used for app functionality).

## Known gaps
- Phone numbers aren't SMS-verified (by choice), so someone can register a number that isn't theirs.
- Locked-content gating protects Firestore docs, not the media files themselves.
- Guests learn nothing until a sponsor acts; there's no email/push notification to the sponsor yet.
