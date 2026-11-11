# Security setup (Oct 2026)

Everything here is switched on by code already in the repo. These are the steps only you can do.

## 0. Install the new packages
`package.json` and `package-lock.json` changed (next 16.4.3, eslint-config-next 16.4.3, firebase-admin 14.5.0). In `babsonsound-web`:
`rm -rf node_modules && npm ci`. (An interrupted install here left stray `.name-xxxx` folders inside `node_modules`; `npm ci` replaces them.)

## 1. Vercel environment variables
| Variable | Needed | What it does |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | for the CAPTCHA | Public Cloudflare Turnstile site key. |
| `TURNSTILE_SECRET_KEY` | for the CAPTCHA | Server-only Turnstile secret. Without both keys the check is skipped (sign-ups still work; the hard 429 limits still apply). |
| `APPCHECK_ENFORCE` | later | Set to `1` once the iOS build that sends App Check tokens is live. Makes `/api/contacts/*` refuse requests without one. Leave empty until then. |
| `HEALTH_KEY` | optional | `/api/health` is admin-only now. For scripts or uptime checks send `x-health-key: <value>` (falls back to `CRON_SECRET`). |
| `RESEND_API_KEY` | already set? | The day-10 "verify your email" reminder uses it. Without it the reminder is skipped, nothing breaks. |
| `WORKER_SECRET` | for the Library worker | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Put the same value on the studio PC. The PC trades it for a 1-hour Firestore login; it never holds a service-account key. Without it the worker routes answer BR-LIB-001. |
| `OWNER_EMAILS` | already set | Owners now also need a verified email. |
| `PII_KEY` | already set | Also encrypts contact names. Must stay the same. |

## 2. Cloudflare (Turnstile)
dash.cloudflare.com → Turnstile → Add widget. Hostnames: `babsonradio.com` (add `localhost` while testing). Mode: Managed. Copy the site key and secret into Vercel and redeploy.

## 3. Firebase console
1. **Firestore → TTL policies** (so the counters clean themselves): add a policy on field `expireAt` for collection groups `signupIp`, `signupDomain` and `signupGlobal`.
2. **App Check** → Apps → your iOS app → register with **App Attest**. Leave enforcement for Firebase's own products off for now (our server checks the token itself).
3. **App Check → Manage debug tokens**: for the simulator and Debug builds, run once, copy the debug token printed in Xcode's console, and add it here.
4. Deploy the rules: `firebase deploy --only firestore:rules` (clients can no longer write `firstName` or `displayName` directly; new server-only collections are listed).

## 4. Xcode
1. Target → Package Dependencies → the Firebase package → add the **FirebaseAppCheck** product to the app target. (Until then `AppCheckSupport.swift` compiles to nothing and no token is sent.)
2. Signing & Capabilities → add **App Attest** (adds `com.apple.developer.devicecheck.appattest-environment`; use `production` for release).
3. `NSContactsUsageDescription` and the App Store privacy label for Contacts: see `CONTACTS_AND_GUESTS.md`.
4. The Swift changes were not compiled here; build once and fix anything the compiler says.

## 5. Rolling out
For the order with the new bundle ID and Team ID, and what to test first, see `APP_REVIEW.md` section 5. Keep it off through App Review.
1. Deploy the site. Nothing changes for normal users.
2. Ship the iOS build (App Check, contacts matching with names, Keychain, locked-account screen for guests).
3. After most people are on that build, set `APPCHECK_ENFORCE=1`.
4. If real students get BR-ACC-024 after that, empty `APPCHECK_ENFORCE` to switch it off, then check the App Attest registration.

## 6. Content-Security-Policy (report-only)
The CSP is sent as `Content-Security-Policy-Report-Only`: nothing is blocked, the browser console logs what would have been. Open the site (signed out and signed in, the live page, the Library with a YouTube episode, an admin page) and read the console.
Expected reports, because Next.js writes small inline scripts into every page and a hash-only policy has no way to allow them:
- the Turbopack runtime start-up line (`globalThis["TURBOPACK"]…`)
- `(self.__next_f=self.__next_f||[]).push([0])`
- the big `self.__next_f.push([1,"…"])` data script (a different hash on every page)

To enforce later you have two options: nonces from `proxy.ts` (makes every page dynamic, which costs CPU on the free plan), or allowing `'unsafe-inline'` for scripts (weaker, but still blocks other origins). Keep `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` either way.
The theme script in `app/layout.tsx` is allowed by hash and the hash is computed from `lib/themeScript.ts`, so editing that script never needs a CSP change.

## 7. After deploying: quick checks
- `curl -I https://babsonradio.com/` shows the headers and no `X-Powered-By`.
- `/api/health` signed out → 401; with an admin signed in (or `x-health-key`) → the checklist.
- Admin Panel → Phone lookup loads.
- The 14-day delete can't be tried by hand without waiting two weeks; `lib/unverifiedSweep.test.ts` covers the whole lifecycle. After the first cron run, `GET /api/cron/birthdays` (with the `CRON_SECRET` bearer) returns a `cleanup` object with the counts.
