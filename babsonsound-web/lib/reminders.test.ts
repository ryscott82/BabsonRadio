import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nyToMs } from './slotAuto.ts'
import { DEFAULT_PREFS, DAY_GRACE_MS, REMINDER_HORIZON_MS, dayBeforeAt, dueReminders, logIdsFor, movedId, patchPrefs, readPrefs, reminderId, reminderText, whenShort, type LogMap, type Occurrence } from './reminders.ts'
import { boothRole, mayExitPanel, signToken, tokenMayExit, verifyToken, type BoothClaims } from './booth.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const MIN = 60_000, HOUR = 3_600_000
const at = (m: number, d: number, h: number, min = 0) => nyToMs(2026, m, d, h, min)
const START = at(11, 17, 20) // Tue Nov 17, 8 pm
const show = (o: Partial<Occurrence> = {}): Occurrence => ({ key: 'slot-a1', kind: 'slot', title: 'Late Night', startAt: START, hostUids: ['u1'], studio: true, ...o })
const booking = (o: Partial<Occurrence> = {}): Occurrence => ({ key: 'booking-b1', kind: 'booking', title: 'Studio booking', startAt: START, hostUids: ['u1'], studio: true, ...o })
const P = { u1: { ...DEFAULT_PREFS } }, E = { u1: true }
const due = (occ: Occurrence[], now: number, logs: LogMap = {}, prefs = P, can: Record<string, boolean> = E) => dueReminders(occ, logs, prefs, can, now)
const kinds = (d: ReturnType<typeof due>) => d.map(x => x.kind)

test('the day-before reminder is 9 am New York the day before, including across daylight saving', () => {
  assert.equal(dayBeforeAt(START), at(11, 16, 9))
  assert.equal(dayBeforeAt(at(11, 1, 10)), at(10, 31, 9)) // month boundary
  assert.equal(dayBeforeAt(at(3, 9, 8)), at(3, 8, 9)) // the Monday after clocks spring forward (Mar 8 2026): still 9 am local
  assert.equal(dayBeforeAt(at(11, 2, 8)), at(11, 1, 9)) // the day clocks fall back
  assert.equal(dayBeforeAt(at(11, 17, 0, 30)), at(11, 16, 9)) // a 12:30 am show: 9 am the calendar day before
})

test('nothing is due before the trigger; each reminder is due after it', () => {
  assert.deepEqual(due([show()], at(11, 16, 8, 59)), [])
  assert.deepEqual(kinds(due([show()], at(11, 16, 9, 1))), ['dayBefore'])
  assert.deepEqual(due([show()], START - 61 * MIN, { [reminderId('slot-a1', 'dayBefore', 'u1')]: { startAt: START } }), []) // already sent
  assert.deepEqual(kinds(due([show()], START - 59 * MIN, { [reminderId('slot-a1', 'dayBefore', 'u1')]: { startAt: START } })), ['hourBefore'])
  assert.deepEqual(due([show()], START - 30 * MIN, { [reminderId('slot-a1', 'hourBefore', 'u1')]: { startAt: START } }), [])
  assert.equal(due([show()], START - 4 * MIN).length, 0) // too close to be useful for a show
})

test('a late run never sends two at once: only the closest passed trigger can be due', () => {
  assert.deepEqual(kinds(due([show()], START - 30 * MIN)), ['hourBefore']) // the day-before one is dropped
  assert.deepEqual(kinds(due([booking()], START - 10 * MIN)), ['quarter'])
  assert.deepEqual(kinds(due([booking()], START - 30 * MIN)), ['hourBefore'])
  assert.deepEqual(due([booking()], START - 10 * MIN, { [reminderId('booking-b1', 'quarter', 'u1')]: { startAt: START } }), [])
})

test('only studio bookings get the 15-minute reminder', () => {
  assert.equal(due([show()], START - 10 * MIN).length, 0)
  assert.equal(due([booking()], START - 10 * MIN).length, 1)
  assert.deepEqual(logIdsFor(show(), 'u1').filter(i => i.includes('_quarter_')), [])
  assert.equal(logIdsFor(booking(), 'u1').filter(i => i.includes('_quarter_')).length, 1)
})

test('skips anything past, started or booked after the day-before trigger passed', () => {
  assert.deepEqual(due([show()], START + MIN), [])
  assert.deepEqual(due([show()], START), [])
  assert.deepEqual(due([show({ startAt: at(11, 16, 20) })], at(11, 16, 20) + MIN), [])
  // booked this evening for tomorrow 7 pm: the 9 am trigger is 10 hours old, more than the grace
  assert.deepEqual(due([show()], at(11, 16, 9) + DAY_GRACE_MS + MIN), [])
  assert.equal(due([show()], at(11, 16, 9) + DAY_GRACE_MS - MIN).length, 1)
})

test('settings turn kinds and channels off; nobody without a host account is reminded', () => {
  const off = (o: object) => ({ u1: { ...DEFAULT_PREFS, ...o } })
  assert.deepEqual(due([show()], at(11, 16, 10), {}, off({ dayBefore: false })), [])
  assert.deepEqual(due([show()], START - 50 * MIN, {}, off({ hourBefore: false })), [])
  assert.deepEqual(due([booking()], START - 10 * MIN, {}, off({ bookingQuarter: false })), [])
  assert.deepEqual(due([show()], at(11, 16, 10), {}, off({ email: false, push: false })), [])
  const d = due([show()], at(11, 16, 10), {}, off({ email: false }))[0]; assert.equal(d.email, false); assert.equal(d.push, true)
  assert.equal(due([show()], at(11, 16, 10), {}, P, { u1: false })[0].email, false) // unsubscribed or no address: push only
  assert.deepEqual(due([show({ hostUids: ['ghost'] })], at(11, 16, 10)), []) // no user doc, no prefs
  assert.equal(due([show({ hostUids: ['u1', 'u1'] })], at(11, 16, 10)).length, 1) // listed twice, reminded once
})

test('a moved show gets one "moved" message instead of a stale reminder, then reminders resume for the new time', () => {
  const NEW = START + 2 * HOUR
  const old: LogMap = { [reminderId('slot-a1', 'dayBefore', 'u1')]: { startAt: START } }
  const moved = due([show({ startAt: NEW })], at(11, 16, 10), old)
  assert.deepEqual(kinds(moved), ['moved']); assert.equal(moved[0].prevStartAt, START); assert.equal(moved[0].id, movedId('slot-a1', NEW, 'u1'))
  assert.match(reminderText(moved[0]).subject, /moved to/)
  // already told about this move: the new time's own reminders are used (the old log does not count as sent)
  const told: LogMap = { ...old, [movedId('slot-a1', NEW, 'u1')]: { startAt: NEW } }
  assert.deepEqual(kinds(due([show({ startAt: NEW })], at(11, 16, 10), told)), ['dayBefore'])
  assert.deepEqual(due([show({ startAt: NEW })], at(11, 16, 10), { ...told, [reminderId('slot-a1', 'dayBefore', 'u1')]: { startAt: NEW } }), [])
  // never reminded before the move: no "moved" message, the normal reminder simply uses the new time
  assert.deepEqual(kinds(due([show({ startAt: NEW })], at(11, 16, 10))), ['dayBefore'])
  // moved twice: each new time is told once
  const NEW2 = NEW + HOUR
  assert.equal(due([show({ startAt: NEW2 })], at(11, 16, 10), told)[0].kind, 'moved')
  // a moved show that is now in the past is dropped; weekly airings never use "moved"
  assert.deepEqual(due([show({ startAt: at(11, 16, 8) })], at(11, 16, 10), old), [])
  const w = show({ key: `weekly-w1-${START}`, kind: 'weekly' })
  assert.deepEqual(kinds(due([w], at(11, 16, 10))), ['dayBefore'])
  assert.ok(!logIdsFor(w, 'u1').some(i => i.includes('moved')))
})

test('settings: defaults on, only known true/false fields accepted', () => {
  assert.deepEqual(readPrefs(undefined), DEFAULT_PREFS); assert.deepEqual(readPrefs({ email: false, junk: 1, push: 'no' }), { ...DEFAULT_PREFS, email: false })
  const r = patchPrefs(DEFAULT_PREFS, { hourBefore: false }); assert.equal(r.ok && r.prefs.hourBefore, false); assert.equal(r.ok && r.prefs.email, true)
  for (const bad of [{ email: 'yes' }, { nope: true }, {}, [], null, 'x']) assert.equal(patchPrefs(DEFAULT_PREFS, bad).ok, false, JSON.stringify(bad))
  assert.deepEqual(Object.keys(DEFAULT_PREFS).sort(), ['bookingQuarter', 'dayBefore', 'email', 'hourBefore', 'push'])
  const api = src('app/api/me/reminders/route.ts'); assert.match(api, /showReminders/); assert.match(api, /export async function PATCH/); assert.match(api, /requireUser/)
})

test('the wording has the show, the time and the studio line', () => {
  assert.match(whenShort(START), /Tue, Nov 17 at 8:00 PM ET/)
  const t = reminderText({ kind: 'dayBefore', title: 'Late Night', startAt: START, studio: true, booking: false })
  assert.match(t.subject, /Tomorrow: Late Night/); assert.equal(t.place, 'Studio: PMC basement')
  assert.equal(reminderText({ kind: 'dayBefore', title: 'x', startAt: START, studio: false, booking: false }).place, '') // pre-recorded: no studio line
  assert.match(reminderText({ kind: 'quarter', title: 'x', startAt: START, studio: true, booking: true }).lead, /Check-in is open/)
  const m = src('lib/server/mailer.ts'); assert.match(m, /babsonradio\.com\/schedule/); assert.match(m, /Turn these reminders off/)
})

test('the endpoint: secret required, dry mode, claim before send, no new Vercel cron, nothing sent twice', () => {
  const route = src('app/api/cron/reminders/route.ts')
  assert.match(route, /authorization'\) !== `Bearer \$\{secret\}`/); assert.match(route, /!secret \|\|/); assert.match(route, /searchParams\.get\('dry'\) === '1'/)
  const run = src('lib/server/reminders.ts')
  assert.ok(run.indexOf('runTransaction') < run.indexOf('sendMail(') && run.indexOf('runTransaction') < run.indexOf('notifyUserDevices('), 'claimed in the log before anything is sent')
  assert.match(run, /if \(o\.dry\) return/); assert.ok(run.indexOf('if (o.dry) return') < run.indexOf('runTransaction')) // dry writes and sends nothing
  assert.match(run, /\.where\('startAt', '>', from\)\.where\('startAt', '<=', to\)/) // indexed range, single field
  assert.match(run, /if \(!occ\.length\) return/) // nothing coming up: no other reads
  assert.match(run, /Number\(s\.get\('startAt'\)\) === d\.startAt\) return false/) // a second caller loses
  assert.equal(REMINDER_HORIZON_MS, 40 * HOUR)
  const vercel = JSON.parse(src('vercel.json')); assert.equal(vercel.crons.length, 2); assert.ok(!JSON.stringify(vercel).includes('reminders'))
  assert.match(src('firestore.rules'), /match \/reminderLog\/\{id\}\s+\{ allow read, write: if false; \}/)
  assert.match(run, /unsubscribed'\) !== true/) // the existing unsubscribe is respected for email
  assert.match(src('app/api/reminders/off/route.ts'), /uidFromReminderOffToken/); assert.match(src('app/api/reminders/off/route.ts'), /export const POST/)
})

test('the turn-off link is signed and not interchangeable with the unsubscribe link', () => {
  const t = src('lib/unsubscribeToken.ts'); assert.match(t, /hmac\('remind-off'/); assert.match(t, /hmac\('unsub'/)
})

// ── booth: role, exit panel, censoring, door ping ────────────
const secret = 'test-secret-test-secret'
const claims = (role: ReturnType<typeof boothRole>): BoothClaims => ({ u: 'u', n: 'N', s: 's', l: true, x: mayExitPanel(role), exp: Date.now() + 60_000 })
test('role comes from the access level; only E-board and Admin may exit the panel', () => {
  assert.equal(boothRole('student'), 'student'); assert.equal(boothRole('director'), 'eboard'); assert.equal(boothRole('admin'), 'admin'); assert.equal(boothRole('bypass'), 'student'); assert.equal(boothRole('guest'), 'student')
  assert.equal(mayExitPanel('student'), false); assert.equal(mayExitPanel('eboard'), true); assert.equal(mayExitPanel('admin'), true)
  for (const [role, may] of [['student', false], ['eboard', true], ['admin', true]] as const) {
    const back = verifyToken(secret, signToken(secret, claims(role))); assert.equal(tokenMayExit(back), may, role) // survives signing
  }
  assert.equal(tokenMayExit(null), false)
  assert.equal(tokenMayExit({ u: 'u', n: 'N', s: 's', l: true, exp: 1 }), false) // an old token without the flag is refused
  const tampered = signToken(secret, claims('student')).split('.'); const forged = Buffer.from(JSON.stringify({ ...claims('student'), x: true })).toString('base64url')
  assert.equal(verifyToken(secret, `${forged}.${tampered[1]}`), null) // a student cannot add x:true to their own token
})
test('session and bypass return the role and sign x only for E-board and Admin', () => {
  const s = src('app/api/booth/session/route.ts'), b = src('app/api/booth/bypass/route.ts')
  assert.match(s, /const role = boothRole\(a\.level\)/); assert.match(s, /level: a\.level, role,/); assert.match(s, /x: mayExitPanel\(role\)/)
  assert.match(b, /role: 'student'/); assert.match(b, /x: false/) // nobody signed in: never the exit panel, even with the emergency PIN
  assert.equal((s + b).match(/signToken\(/g)?.length, 2)
  for (const f of ['app/api/booth/session/route.ts', 'app/api/booth/bypass/route.ts']) assert.ok(!/x: true/.test(src(f)), f)
})
test('what the booth shows that a person wrote is starred out, never refused', () => {
  const b = src('lib/server/booth.ts'); assert.match(b, /shownNote[\s\S]*text: censor\(n\.text\), by: censor\(n\.by\)/); assert.match(b, /shownCrew[\s\S]*name: censor\(p\.name\), firstName: censor\(p\.firstName\)/)
  const s = src('app/api/booth/session/route.ts')
  assert.match(s, /crew: keep \? shownCrew\(/); assert.match(s, /name: censor\(name\)/); assert.match(s, /firstName: censor\(/); assert.match(s, /note: shownNote\(note\)/)
  assert.match(src('app/api/booth/bypass/route.ts'), /note: shownNote\(note\)/)
  const d = src('app/api/booth/door/route.ts'); assert.equal((d.match(/firstName: censor\(firstName\)/g) ?? []).length, 2); assert.match(d, /driverName: censor\(crew\.driverName\)/)
  const c = src('app/api/booth/door-claim/route.ts'); assert.match(c, /firstName: censor\(got\.firstName\), name: censor\(got\.name\)/); assert.match(c, /members: shownCrew\(/); assert.match(c, /firstName: censor\(got\.firstName\) \}/)
  assert.match(src('app/api/booth/takeover/route.ts'), /firstName: censor\(h\.newDriver\.firstName\)/)
  for (const f of ['app/api/booth/session/route.ts', 'app/api/booth/bypass/route.ts', 'app/api/booth/door/route.ts', 'app/api/booth/door-claim/route.ts']) assert.ok(!/assertClean|HttpError\(4\d\d, [^)]*censor/.test(src(f)) || f.includes('x'), f) // display only: never a refusal
  assert.match(src('app/api/booth/note/route.ts'), /assertClean/) // writes are still checked
  // the signed token and the activity log keep the real name
  assert.match(s, /signToken\(secret, \{ u: t\.uid, n: name,/)
})
test('the door ping stays readable signed out and carries no name', () => {
  assert.match(src('firestore.rules'), /match \/boothDoorPing\/\{id\}\s+\{ allow read: if true; allow write: if false; \}/)
  const d = src('app/api/booth/door/route.ts'); const pings = d.match(/collection\('boothDoorPing'\)\.doc\('latest'\), \{[^}]*\}/g) ?? []
  assert.equal(pings.length, 2); for (const p of pings) assert.match(p, /\{ claimId(: id)?, at: now \}/)
  assert.match(d, /exp: now \+ 60_000/); assert.match(src('app/api/booth/door-claim/route.ts'), /Number\(s\.get\('exp'\)\) < now/) // claims last 60 s
})
