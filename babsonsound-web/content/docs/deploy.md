# Deploy and launch runbook

Status as of Nov 11, 2026: the CPU plan v2 work and the App Store prep are committed on `main` but **not pushed**. Vercel has paused deployments for the team until Dec 7 (see Server load and CPU) unless Vercel lifts it sooner.

## Order of a normal deploy

1. **Check the tree.** `npx tsc --noEmit`, `npx eslint`, `npm test`. A change to `firestore.rules` or `firestore.indexes.json` needs step 2 first.
2. **Firebase rules and indexes first:** `firebase deploy --only firestore:rules,firestore:indexes`. The live page listens to `liveState/current`, which needs the new rule. If the rule is late, the page falls back to a copy refreshed once a minute.
3. **Push to `main`.** Vercel builds on every push. The build runs `docs:sync` first, so the guides on this page refresh.
4. **Watch the build.** `next build` is not run in the development sandbox, so the first Vercel build is the real check. Fix and push again if it fails.
5. **After it is green:** open the site signed out and signed in, play the stream, check now playing and the schedule, open Admin > Server load, and confirm the tiers show Normal.

## Settings in Vercel (Project > Settings > Environment Variables)

Names only. Values stay in Vercel and your password vault.

| Name | What it is for |
|---|---|
| `OWNER_EMAILS` | Accounts that are always admin; also get the usage alert emails |
| `RESEND_API_KEY` | Sending admin, launch, approval and alert email |
| `CRON_SECRET` | Protects the two daily cron routes |
| `PII_KEY` | Encrypts birthdays. Without it the About you step fails (BR-SRV-009). Keep a safe copy |
| `PHONE_HASH_PEPPER` | Keyed hash for phone matching |
| `WORKER_SECRET` | Lets the studio PC worker sign in (also set on the PC) |
| `SUPPORT_EMAIL` | The public contact address on /support, Terms and footer. Use a mailbox someone reads |
| `CONTACT_EMAIL` | Older fallback for the contact address |
| `AZURACAST_URL`, station id | Where now playing comes from |
| `APPCHECK_ENFORCE` | Leave unset (off) until the iOS build with App Check works on a real phone |
| `READ_METER` | Set to 0 to turn off the Firestore read meter |

## Weekly routine (Mondays)

1. Open the Vercel dashboard > Usage and read Fluid Active CPU, edge requests, function invocations and fast data transfer.
2. Enter them in Admin > Server load > Enter usage. A reminder email goes to the owners on Mondays when no reading was entered for a week.
3. Look at the forecast and the tier levels. If pressure passes 50%, read the Server load and CPU guide, "What to do when usage is high".

## If Vercel pauses the site

- The notice names the reason and the end date. Hobby pauses last until the end of the usage window (about 30 days) unless support lifts it.
- Write to Vercel support (and post in the Vercel community) with the cause, the fix, and that we cannot buy a plan (one-time payments only). Keep a copy of what you sent.
- While deployments are paused nothing new can ship. The old site keeps whatever state it had.
- Backup plan if it will take weeks: a second host (Netlify free has a hard cap that cannot bill us) with DNS pointed at it. Needs a second deploy and a DNS change.

## Email

- **Our own mail** (approval, launch, alerts) goes through Resend from `babsonradio.com`. SPF and DKIM exist; add a `_dmarc` TXT record (`v=DMARC1; p=none; rua=mailto:<mailbox>`) so mail stops landing in spam.
- **Firebase mail** (verify email, password reset) comes from Firebase. Set Authentication > Templates > customize domain to babsonradio.com, add the DNS records it lists (up to 24 hours), wait for "Verification complete", then Apply. A domain can have only one SPF record, so merge.

## The studio PC worker

Install and test steps are in the Library worker guides. Nothing listener-facing depends on the PC.

## Rolling back

Vercel > Deployments > pick the last good one > Promote. Rules: redeploy the previous `firestore.rules` from git. Never roll back data by hand without a copy.
