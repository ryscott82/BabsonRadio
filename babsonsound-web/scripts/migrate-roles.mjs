// Moves every account to the new access model: users/{uid}.level = guest | student | director | admin,
// plus the badges studioTrained / radioTrained, and the unsubscribe flag `unsubscribed`.
//
//   node --env-file=.env.local scripts/migrate-roles.mjs                      dry run: prints the before/after table, writes nothing
//   node --env-file=.env.local scripts/migrate-roles.mjs --apply              writes level, badges, unsubscribed (old fields are left in place)
//   node --env-file=.env.local scripts/migrate-roles.mjs --apply --drop-legacy  also removes the old fields, sign-in claims and the tester allowlist
//
// Safe to run again: an account that already has a level keeps it (the level is the source of truth from then on),
// and only missing badge fields are filled in. Run order for launch: dry run, --apply, deploy code, deploy rules, then --drop-legacy.
//
// Mapping (decided from the old fields):
//   developer, superAdmin  -> admin            director -> director
//   showHost, or training certified (not revoked) -> student + radioTrained + studioTrained   (guest if no school email)
//   listener / beta tester / anything else        -> student if the email is babson.edu, olin.edu or wellesley.edu, else guest
//   OWNER_EMAILS                                  -> admin
// Needs FIREBASE_SERVICE_ACCOUNT_JSON (see .env.example).
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const APPLY = process.argv.includes('--apply')
const DROP = process.argv.includes('--drop-legacy')
if (DROP && !APPLY) { console.error('--drop-legacy needs --apply too.'); process.exit(1) }
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.'); process.exit(1) }

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
const db = getFirestore(), auth = getAuth()

const SCHOOL = /^[a-z0-9._%+-]+@(babson|olin|wellesley)\.edu$/ // exact domains, same as the server
const LEVELS = ['guest', 'student', 'director', 'admin']
const owners = (process.env.OWNER_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

// ── read everything ──
const users = (await db.collection('users').get()).docs
const training = new Map((await db.collection('training').get()).docs.map(d => [d.id, d]))
const claims = new Map()
for (let tok; ;) {
  const page = await auth.listUsers(1000, tok)
  page.users.forEach(u => claims.set(u.uid, u.customClaims ?? {}))
  tok = page.pageToken
  if (!tok) break
}

// ── decide ──
const legacyLabel = (d) => {
  const c = claims.get(d.id) ?? {}
  if (c.developer === true || d.get('role') === 'developer') return 'developer'
  const r = d.get('role') ?? (LEVELS.includes(d.get('level')) ? '(already migrated)' : '(none)')
  const tester = d.get('betaTester') === true || c.tester === true || d.get('betaStatus') != null
  return tester && (r === 'listener' || r === '(none)') ? 'beta tester' : r
}
function decide(d) {
  const email = String(d.get('email') ?? '').toLowerCase()
  const c = claims.get(d.id) ?? {}
  const school = SCHOOL.test(email)
  const t = training.get(d.id)
  const certified = !!t && t.get('certifiedAt') != null && t.get('revokedAt') == null
  const role = d.get('role')
  const existing = LEVELS.includes(d.get('level')) ? d.get('level') : null

  let level, why
  if (existing) { level = existing; why = 'kept' }
  else if (c.developer === true || role === 'developer' || role === 'superAdmin') { level = 'admin'; why = role === 'superAdmin' ? 'superAdmin' : 'developer' }
  else if (role === 'director') { level = 'director'; why = 'director' }
  else { level = school ? 'student' : 'guest'; why = role === 'showHost' ? 'host' : certified ? 'certified' : (role ?? 'none') }
  if (owners.includes(email)) level = 'admin'

  const host = role === 'showHost' || certified
  const high = level === 'admin' || level === 'director'
  let radio = d.get('radioTrained'), studio = d.get('studioTrained')
  if (typeof radio !== 'boolean') radio = level === 'student' && host
  if (typeof studio !== 'boolean') studio = level === 'student' && host
  if (level === 'guest') { radio = false; studio = false }

  const patch = {}
  if (!existing || existing !== level) patch.level = level
  if (d.get('radioTrained') !== radio) patch.radioTrained = radio
  if (d.get('studioTrained') !== studio) patch.studioTrained = studio
  if (d.get('emailOptOut') === true && d.get('unsubscribed') !== true) {
    patch.unsubscribed = true
    if (d.get('emailOptOutAt')) patch.unsubscribedAt = d.get('emailOptOutAt')
  }
  const warn = high && !school && !owners.includes(email) && d.get('demo') !== true
  return { id: d.id, email, before: legacyLabel(d), level, radio: radio || high, studio: studio || high, patch, why, warn }
}
const rows = users.map(decide)

// ── report ──
const count = (xs, f) => xs.reduce((m, x) => (m.set(f(x), (m.get(f(x)) ?? 0) + 1), m), new Map())
const table = (title, m) => { console.log(`\n${title}`); for (const [k, v] of [...m].sort()) console.log(`  ${String(k).padEnd(22)} ${String(v).padStart(6)}`) }
console.log(APPLY ? (DROP ? 'APPLY + DROP LEGACY' : 'APPLY') : 'DRY RUN (nothing is written)')
table(`BEFORE (old role)               total ${rows.length}`, count(rows, r => r.before))
table('AFTER (new level)', count(rows, r => r.level))
console.log(`\n  radioTrained (incl. directors/admins): ${rows.filter(r => r.radio).length}`)
console.log(`  studioTrained (incl. directors/admins): ${rows.filter(r => r.studio).length}`)
console.log('\nBEFORE -> AFTER')
for (const [k, v] of [...count(rows, r => `${r.before.padEnd(20)} -> ${r.level}`)].sort()) console.log(`  ${k.padEnd(34)} ${String(v).padStart(6)}`)
const changing = rows.filter(r => Object.keys(r.patch).length)
console.log(`\n${changing.length} account(s) would change, ${rows.length - changing.length} already correct.`)
const warns = rows.filter(r => r.warn)
if (warns.length) {
  console.log('\nHEADS UP: these admins/directors have no school email. The server treats them as guests unless their email is in OWNER_EMAILS')
  console.log('(or they are the demo account). Add them to OWNER_EMAILS, or give them a school email, before you deploy:')
  warns.forEach(r => console.log(`  ${r.email || r.id}  (${r.level})`))
}
if (!owners.length) console.log('\nNote: OWNER_EMAILS is not set in this shell, so no owner accounts were forced to admin.')

if (!APPLY) { console.log('\nDry run only. Add --apply to write.'); process.exit(0) }

// ── write ──
let n = 0
for (let i = 0; i < changing.length; i += 400) {
  const batch = db.batch()
  for (const r of changing.slice(i, i + 400)) batch.update(db.collection('users').doc(r.id), r.patch)
  await batch.commit(); n += Math.min(400, changing.length - i)
}
console.log(`\nWrote ${n} account(s).`)

// Phone notification choices: the tester alert kind no longer exists.
const dev = await db.collection('deviceTokens').where('kinds', 'array-contains', 'testers').get()
for (let i = 0; i < dev.docs.length; i += 400) {
  const batch = db.batch()
  dev.docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { kinds: FieldValue.arrayRemove('testers') }))
  await batch.commit()
}
if (dev.size) console.log(`Removed the old "testers" alert from ${dev.size} phone(s).`)

if (DROP) {
  const legacy = { role: FieldValue.delete(), betaTester: FieldValue.delete(), betaStatus: FieldValue.delete(), openMember: FieldValue.delete(), earlyAccess: FieldValue.delete(), hostOfShows: FieldValue.delete(), emailOptOut: FieldValue.delete(), emailOptOutAt: FieldValue.delete() }
  for (let i = 0; i < users.length; i += 400) {
    const batch = db.batch()
    users.slice(i, i + 400).forEach(d => batch.update(d.ref, legacy))
    await batch.commit()
  }
  let cleared = 0
  for (const [uid, c] of claims) {
    if (c.developer === undefined && c.tester === undefined && c.openMember === undefined) continue
    const { developer, tester, openMember, ...rest } = c; void developer; void tester; void openMember
    await auth.setCustomUserClaims(uid, rest); cleared++
  }
  await db.collection('config').doc('betaTesters').delete().catch(() => {})
  await db.collection('users').doc('preview-developer').delete().catch(() => {}) // left over from the old preview unlock
  console.log(`Dropped old fields on ${users.length} account(s), cleared old sign-in claims on ${cleared}, deleted config/betaTesters.`)
  console.log('People with a cleared claim pick it up the next time they sign in or refresh.')
}
console.log('\nDone.')
