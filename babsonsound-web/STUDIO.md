# Studio training

Replaces the "I'm at my training" button + manual admin confirm. Server only for now. The old flow (`/api/training/*`, Admin > Training certify / revoke) keeps working until Frontend ships Studio; then delete it.
**Ship after launch, not before.** Nothing here touches the launch lock. The only access change is that a Studio / Radio badge past its date counts as not trained.

## Collections (admin SDK only; rules deny every client)
| Collection | Holds |
|---|---|
| `trainingSessions/{id}` | `covers`, `title`, `startsAt`, `endsAt`, `location`, `capacity`, `trainerUid`, `status` (scheduled / checkin_open / closed / confirmed), `checkinSecret`, `rsvpCount` |
| `trainingAttendance/{sessionId_uid}` | `rsvpAt`, `checkedInAt`, `removedBy/At`, `confirmedBy/At`, plus `lastAttemptAt`, `lastScore`, `quizAttempts`, `quizPassedAt`, `grantedAt` |
| `trainingGrants/{id}` | `uid`, `badge`, `sessionId`, `trainerUid`, `quizId`, `quizScore`, `agreementVersion`, `grantedAt`, `expiresAt`, `grantedBy` ('system' or an admin uid), `reason`, `revokedAt/By`, `revokeReason`. Append-only: only the revoke fields are ever set. Ids are `{sessionId}_{uid}_{badge}` for session grants (so a retry can't double-grant), random for manual ones, `legacy_{uid}_{badge}` for migrated ones |
| `clubInterest/{uid}` | `interested`, `note`, `updatedAt` |
| `trainingCheckinGuard/{uid}`, `trainingCheckinLog/{id}`, `trainingNotices/{id}` | try counter + lock (TTL on `expireAt`), wrong-code / lock log (TTL on `expireAt`), sent-notice markers |

The profile (`users/{uid}`) keeps the badge the server checks: `studioTrained` / `radioTrained` plus `studioExpiresAt` / `radioExpiresAt`. A badge with no date (very old data) does not expire until the migration runs.

## Routes
| Route | Who | Notes |
|---|---|---|
| `GET /api/studio/sessions` | any member | upcoming and last week, with the caller's own `me` state and `canManage` |
| `POST /api/studio/sessions` | Director / Admin | `{title, covers, startsAt, endsAt, location, capacity, trainerUid?}`. Trainer must be a Director or Admin; only an Admin can name someone else |
| `POST …/sessions/{id}/rsvp` | verified member | `{rsvp?: boolean}`, capacity checked |
| `POST …/checkin/open`, `…/checkin/close` | trainer or Admin | open re-checks the trainer is still staff; auto-closes at `endsAt` + 15 min |
| `GET …/checkin/code` | trainer or Admin | `{codes:[{code, from, until, link}], refetchBy}`: current + next 9 windows (QR link in each). Refetch about every 4 minutes. No secret |
| `POST …/checkin` | verified Student | `{code}`. 5 tries/min, 15-minute lock after 10 wrong, logged, one per person per session |
| `GET …/attendees`, `POST …/attendees/remove`, `POST …/confirm` | trainer or Admin | remove `{uid}` (not after confirmed); confirm `{uids?}` after check-in is closed |
| `GET/POST /api/studio/quiz` | confirmed attendee | GET `?sessionId=` gives questions (no answers) + agreement; POST `{sessionId, answers, agreement}` grades, checks the signature, grants |
| `GET/POST /api/studio/interest` | any member | club recruiting flag |
| `GET /api/admin/studio/roster` | Director / Admin | `?q &badge &status &trainer &sessionId`; includes old-flow badges with no grant as `legacy` |
| `GET /api/admin/studio/recruits`, `GET /api/admin/studio/export` | Director / Admin | CSV: `?kind=roster|session|person|recruits` |
| `POST /api/admin/studio/revoke`, `POST /api/admin/studio/grant` | Director / Admin | reason of 10+ characters; grant `{uid, badges, reason, expiresAt?}` also extends |

Every route returns 403 BR-PERM-001 for a Guest. There is no polling endpoint.

## Rotating code
`code = first 6 decimal digits of HMAC-SHA256(checkinSecret, floor(now / 30 s))` (hex letters are skipped so each digit is equally likely). The current and previous window are accepted, only while the session is `checkin_open`. Only the trainer endpoint returns codes.

## Expiry
`expiresAt` = the next June 30, 11:59 PM America/New_York after `grantedAt` (`lib/studioRules.ts`). `accessOf` treats a badge past its date as not trained (45 s cache kept). Approved shows stay on the schedule; new live requests get BR-TRN-010. Notices: 14 days before and again May 1 to 3, in the daily birthdays cron (`lib/server/studioNotices.ts`); the in-app banner reads `training` from `/api/me`.
A hand-set badge (Admin > Users, old Training page, old quiz) is now stamped with the same end date.

## Quiz and agreement text
`lib/studioConfig.ts` reuses `lib/training.ts` and `lib/conduct.ts` for now. When the real questions and agreement arrive, change only that file and bump the ids.

## Setup / rollout
1. `firebase deploy --only firestore:rules`.
2. Firestore TTL policies on `expireAt` for `trainingCheckinGuard` and `trainingCheckinLog` (optional but tidy).
3. After deploying: `node --env-file=.env.local scripts/studio-migrate-expiry.mjs` (dry run), then `--apply`.
4. Resend must be set up for the expiry email (push still goes without it).

## Not done / decisions to confirm
- Revoking Studio does not revoke Radio that was granted with it.
- Capacity is checked when saving a spot, not at check-in (walk-ins are allowed).
- Old-flow (legacy) badges can still only be revoked on the old Admin > Training page until migrated.
