// One-time: give every existing Studio / Radio badge an end date of June 30, 2027, 11:59 PM Eastern, and record it as a grant
// (trainingGrants/legacy_{uid}_{badge}, grantedBy 'system') so it shows on the Studio roster and can be revoked or extended there.
//
//   node --env-file=.env.local scripts/studio-migrate-expiry.mjs            dry run: prints who would change, writes nothing
//   node --env-file=.env.local scripts/studio-migrate-expiry.mjs --apply    writes users.{badge}ExpiresAt and the grants
//
// Safe to run again: a badge that already has an end date is skipped, and grant ids are fixed. Directors and admins are skipped
// (they skip training). Run it AFTER the new code is deployed and BEFORE the end-of-June notices start. Needs FIREBASE_SERVICE_ACCOUNT_JSON.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const APPLY = process.argv.includes('--apply')
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
const db = getFirestore()

const EXPIRES = Date.UTC(2027, 6, 1, 3, 59, 0) // June 30, 2027, 11:59 PM EDT
const now = Date.now()
const training = new Map((await db.collection('training').get()).docs.map(d => [d.id, d]))
const users = (await db.collection('users').get()).docs

let changed = 0, skipped = 0
for (const u of users) {
  const level = u.get('level')
  if (level === 'director' || level === 'admin' || level === 'guest') continue
  for (const badge of ['studio', 'radio']) {
    if (u.get(`${badge}Trained`) !== true) continue
    if (u.get(`${badge}ExpiresAt`) != null) { skipped++; continue }
    const t = training.get(u.id)
    const grantedAt = t?.get('certifiedAt')?.toMillis?.() ?? u.get('joinedAt')?.toMillis?.() ?? now
    console.log(`${APPLY ? 'set ' : 'would set'} ${badge.padEnd(6)} ${u.id}  ${u.get('email') ?? ''}  -> 2027-06-30`)
    changed++
    if (!APPLY) continue
    await db.collection('trainingGrants').doc(`legacy_${u.id}_${badge}`).create({ // create, never overwrite: grants are append-only
      uid: u.id, badge, sessionId: 'legacy', trainerUid: '', quizId: 'legacy', quizScore: t?.get('score') ?? null,
      agreementVersion: u.get('conductVersion') ?? null, grantedAt: Timestamp.fromMillis(grantedAt), expiresAt: Timestamp.fromMillis(EXPIRES),
      grantedBy: 'system', reason: 'migrated from the old training flow',
    }).catch(e => { if (e?.code !== 6) throw e }) // 6 = already exists
    await u.ref.update({ [`${badge}ExpiresAt`]: Timestamp.fromMillis(EXPIRES) })
  }
}
console.log(`${APPLY ? 'Done' : 'Dry run'}: ${changed} badge(s) ${APPLY ? 'updated' : 'to update'}, ${skipped} already had a date.`)
