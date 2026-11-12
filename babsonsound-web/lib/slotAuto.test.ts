import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AUTO, addWeeksWallClock, autoApproveAtMs, autoEligible, autoStartsInSameWeek, autoStartsOf, checkAudioUpdate, cleanWeeks, evaluateAuto,
  nyToMs, nyWeekKey, openWindow, pendingCount, repeatStarts, toOpenRanges, weekKeysFrom, type Requester,
} from './slotAuto.ts'
import { CONDUCT_VERSION } from './conduct.ts'

const HOUR = 3_600_000, DAY = 24 * HOUR
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ── 24 hours, and the 12 hours before the show ──
test('auto-approval time: 24 hours after the request, or 12 hours before the show when that is sooner', () => {
  const created = Date.UTC(2026, 2, 1, 15, 0)
  assert.equal(autoApproveAtMs(created, created + 48 * HOUR), created + 24 * HOUR)
  assert.equal(autoApproveAtMs(created, created + 36 * HOUR), created + 24 * HOUR) // exactly at the crossover
  assert.equal(autoApproveAtMs(created, created + 30 * HOUR), created + 18 * HOUR)  // start - 12h is sooner
  assert.equal(autoApproveAtMs(created, created + 24 * HOUR), created + 12 * HOUR)  // the shortest lead the rules allow
})

// ── New York week ──
test('a week runs Monday to Sunday and changes at Sunday midnight New York (winter, summer and both clock changes)', () => {
  const cases: [number[], number[], string, string][] = [
    [[2026, 1, 11, 23, 59], [2026, 1, 12, 0, 0], '2026-01-05', '2026-01-12'],   // winter
    [[2026, 7, 5, 23, 59], [2026, 7, 6, 0, 0], '2026-06-29', '2026-07-06'],     // summer
    [[2026, 3, 8, 23, 59], [2026, 3, 9, 0, 0], '2026-03-02', '2026-03-09'],     // spring forward happened that morning (2 am)
    [[2026, 11, 1, 23, 59], [2026, 11, 2, 0, 0], '2026-10-26', '2026-11-02'],   // fall back happened that morning
  ]
  for (const [a, b, ka, kb] of cases) {
    assert.equal(nyWeekKey(nyToMs(a[0], a[1], a[2], a[3], a[4])), ka, `${a} is the end of its week`)
    assert.equal(nyWeekKey(nyToMs(b[0], b[1], b[2], b[3], b[4])), kb, `${b} starts the next week`)
  }
  // Monday morning and Sunday night of one week share a key
  assert.equal(nyWeekKey(nyToMs(2026, 3, 9, 0, 0)), nyWeekKey(nyToMs(2026, 3, 15, 23, 45)))
})

test('in UTC terms: Sunday 11:30 pm New York is already Monday in UTC but still the old week', () => {
  const sun = nyToMs(2026, 6, 14, 23, 30) // 03:30 UTC Monday
  assert.equal(new Date(sun).getUTCDay(), 1)
  assert.equal(nyWeekKey(sun), '2026-06-08')
})

test('weekKeysFrom lists this Monday and the next three', () => {
  assert.deepEqual(weekKeysFrom(nyToMs(2026, 3, 4, 12, 0), 4), ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'])
  assert.deepEqual(weekKeysFrom(nyToMs(2026, 10, 28, 12, 0), 4), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']) // across the November clock change
})

// ── the week limit ──
test('one auto-approved show a week: a second one in the same week is blocked, a staff-approved show does not use the slot', () => {
  const tue = nyToMs(2026, 3, 3, 20, 0), thu = nyToMs(2026, 3, 5, 20, 0), nextTue = nyToMs(2026, 3, 10, 20, 0)
  const autoShow = { approvedBy: 'auto', startAt: tue }, staffShow = { approvedBy: 'uid123', startAt: tue }
  assert.equal(autoStartsInSameWeek(autoStartsOf([autoShow]), thu), 1)      // blocked: weekLimit is 1
  assert.equal(autoStartsInSameWeek(autoStartsOf([staffShow]), thu), 0)     // approved by staff: not counted
  assert.equal(autoStartsInSameWeek(autoStartsOf([autoShow]), nextTue), 0)  // next week is free
  assert.equal(autoStartsInSameWeek(autoStartsOf([{ startAt: tue }]), thu), 0) // older bookings with no approvedBy
})

// ── deciding ──
const GOOD: Requester = { level: 'student', conductVersion: CONDUCT_VERSION, radioTrained: true, radioExpiresAt: null }
const NOW = nyToMs(2026, 3, 3, 12, 0)
const base = (over: Partial<Parameters<typeof evaluateAuto>[0]> = {}) => evaluateAuto({
  now: NOW, status: 'pending', held: false, autoApproveAt: NOW - 1, startMs: NOW + 2 * DAY, type: 'prerecorded',
  requester: GOOD, conductVersion: CONDUCT_VERSION, autoStartsInWeek: 0, conflict: false, ...over,
})

test('a request approves itself only once its time has come', () => {
  assert.deepEqual(base({ autoApproveAt: NOW + 1 }), { action: 'wait' })
  assert.deepEqual(base({ autoApproveAt: NOW }), { action: 'approve' })
  assert.deepEqual(base({ autoApproveAt: null }), { action: 'wait' })
})

test('a held request never auto-approves, however overdue', () => {
  assert.deepEqual(base({ held: true, autoApproveAt: NOW - 10 * DAY }), { action: 'skip', reason: 'held' })
})

test('a request that was already handled is left alone', () => {
  for (const status of ['approved', 'declined', 'cancelled']) assert.deepEqual(base({ status }), { action: 'skip', reason: 'not-pending' })
})

test('the on-air agreement must be signed (current version) at approval time', () => {
  assert.deepEqual(base({ requester: { ...GOOD, conductVersion: undefined } }), { action: 'skip', reason: 'agreement' })
  assert.deepEqual(base({ requester: { ...GOOD, conductVersion: 'old-version' } }), { action: 'skip', reason: 'agreement' })
})

test('a live show needs the radio badge, and an expired badge does not count', () => {
  const expired: Requester = { ...GOOD, radioExpiresAt: NOW - 1 }
  assert.deepEqual(base({ type: 'live', requester: expired }), { action: 'skip', reason: 'training' })
  assert.deepEqual(base({ type: 'live', requester: { ...GOOD, radioTrained: false } }), { action: 'skip', reason: 'training' })
  assert.deepEqual(base({ type: 'live', requester: { ...GOOD, radioExpiresAt: NOW + DAY } }), { action: 'approve' })
  assert.deepEqual(base({ type: 'live', requester: { ...GOOD, level: 'director', radioTrained: false } }), { action: 'approve' }) // directors always count
  assert.deepEqual(base({ type: 'prerecorded', requester: expired }), { action: 'approve' })                                  // pre-recorded needs no badge
  assert.deepEqual(base({ requester: { ...GOOD, level: 'guest' } }), { action: 'skip', reason: 'ineligible' })
})

test('a time taken since the request was made blocks it at approval time, and so does the week limit or a time that has passed', () => {
  assert.deepEqual(base({ conflict: true }), { action: 'skip', reason: 'conflict' })
  assert.deepEqual(base({ autoStartsInWeek: AUTO.weekLimit }), { action: 'skip', reason: 'week-limit' })
  assert.deepEqual(base({ startMs: NOW - 1 }), { action: 'skip', reason: 'past' })
})

test('eligibility at request time: agreement signed, and for live shows the radio badge', () => {
  assert.equal(autoEligible({ type: 'prerecorded', conductSigned: true, radioTrained: false }), true)
  assert.equal(autoEligible({ type: 'live', conductSigned: true, radioTrained: true }), true)
  assert.equal(autoEligible({ type: 'live', conductSigned: true, radioTrained: false }), false)
  assert.equal(autoEligible({ type: 'prerecorded', conductSigned: false, radioTrained: true }), false)
})

// ── repeat ──
test('repeat weeks keep the New York clock time across a clock change, and cleanWeeks takes 0 to 3', () => {
  const tue = nyToMs(2026, 3, 3, 20, 0) // 8 pm EST
  const [w1, w2] = repeatStarts(tue, 2)
  assert.equal(w1, nyToMs(2026, 3, 10, 20, 0)) // 8 pm EDT after the clock change
  assert.equal(w1 - tue, 7 * DAY - HOUR)       // an hour shorter in UTC terms
  assert.equal(w2, nyToMs(2026, 3, 17, 20, 0))
  assert.equal(addWeeksWallClock(tue, 0), tue)
  assert.equal(repeatStarts(tue, 3).length, 3)
  assert.deepEqual([undefined, '', 0, '2', 3].map(v => cleanWeeks(v)), [0, 0, 0, 2, 3])
  assert.deepEqual([4, -1, 1.5, 'x'].map(v => cleanWeeks(v)), [null, null, null, null])
})

test('a repeat group counts as one pending request', () => {
  const rows = [
    { id: 'a', status: 'pending', groupId: 'g' }, { id: 'b', status: 'pending', groupId: 'g' }, { id: 'c', status: 'pending', groupId: 'g' },
    { id: 'd', status: 'pending' }, { id: 'e', status: 'approved', groupId: 'g' }, { id: 'f', status: 'declined' },
  ]
  assert.equal(pendingCount(rows), 2)
})

// ── open times never leak ──
test('open ranges are times only: no names, titles, ids or who asked', () => {
  const t = 1_800_000_000_000
  const booked = [{ startAt: t, endAt: t + HOUR, title: 'Secret Show', hostName: 'Sam', requesterUid: 'u1', id: 'x' } as never]
  const pending = [{ startAt: t + 2 * HOUR, endAt: t + 3 * HOUR, requesterName: 'Alex', requesterEmail: 'a@b.edu', title: 'T' } as never]
  const out = toOpenRanges(booked, pending, t - DAY, t + DAY)
  assert.deepEqual(out, [{ startAt: t, endAt: t + HOUR, pending: false }, { startAt: t + 2 * HOUR, endAt: t + 3 * HOUR, pending: true }])
  for (const r of out) assert.deepEqual(Object.keys(r).sort(), ['endAt', 'pending', 'startAt'])
  assert.doesNotMatch(JSON.stringify(out), /Secret|Sam|Alex|a@b|u1/)
  assert.deepEqual(toOpenRanges(booked, pending, t + 10 * DAY, t + 11 * DAY), []) // outside the window
})

test('the open window is at most 14 days and must make sense', () => {
  assert.deepEqual(openWindow(1000, 2000, 5), { from: 1000, to: 2000 })
  assert.deepEqual(openWindow(0, 60 * DAY, 5), { from: 0, to: 14 * DAY })
  assert.deepEqual(openWindow(null, null, 7), { from: 7, to: 7 + 14 * DAY })
  assert.equal(openWindow(2000, 1000, 5), null)
  assert.equal(openWindow('abc', 1000, 5), null)
})

test('the open route returns only ranges (no title, name or email is read) and is shared-cacheable', () => {
  const r = src('app/api/slots/open/route.ts')
  assert.doesNotMatch(r, /get\('(title|hostName|requesterName|requesterEmail|requesterUid)'\)/)
  assert.match(r, /public, s-maxage=60, stale-while-revalidate=/)
  assert.match(r, /requireMember/)
})

// ── audio link ──
test('only the owner can change a pre-recorded show\'s audio link, and only to https', () => {
  const ok = { ownerUid: 'me', uid: 'me', type: 'prerecorded', status: 'approved', startMs: NOW + DAY, now: NOW, audioURL: 'https://example.com/a.mp3' }
  assert.deepEqual(checkAudioUpdate(ok), { ok: true })
  assert.deepEqual(checkAudioUpdate({ ...ok, uid: 'other' }), { ok: false, status: 404, message: 'Request not found.' })
  assert.equal(checkAudioUpdate({ ...ok, audioURL: 'http://example.com/a.mp3' }).ok, false)
  assert.equal(checkAudioUpdate({ ...ok, audioURL: 'javascript:alert(1)' }).ok, false)
  assert.equal(checkAudioUpdate({ ...ok, audioURL: 'not a url' }).ok, false)
  assert.equal(checkAudioUpdate({ ...ok, type: 'live' }).ok, false)
  assert.equal(checkAudioUpdate({ ...ok, status: 'declined' }).ok, false)
  assert.equal(checkAudioUpdate({ ...ok, startMs: NOW - 1 }).ok, false)
})

// ── wiring ──
test('staff and the auto-approver run the same approval, and no third cron was added', () => {
  assert.match(src('app/api/slots/decision/route.ts'), /approveRequest\(db, requestId, \{ by: t\.uid/)
  assert.match(src('lib/server/autoApprove.ts'), /approveRequest\(db, d\.id, \{ by: 'auto'/)
  const crons = JSON.parse(src('vercel.json')).crons as { path: string }[]
  assert.equal(crons.length, 2)
  for (const p of ['app/api/cron/autoschedule/route.ts', 'app/api/cron/birthdays/route.ts', 'app/api/worker/reconcile/route.ts', 'app/api/cron/slots-auto/route.ts'])
    assert.match(src(p), /runAutoApprove/, p)
  assert.match(src('app/api/nowplaying/route.ts'), /autoApproveTick/)
  const mine = src('app/api/slots/mine/route.ts')
  assert.match(mine, /runAutoApprove/)
  assert.match(mine, /held/); assert.match(mine, /autoApproveAt/); assert.match(mine, /autoBlockedReason/)
})

test('the request route filters title, description and location and takes repeatWeeks', () => {
  const r = src('app/api/slots/request/route.ts')
  assert.match(r, /assertClean\(db, title, description, location\)/)
  assert.match(r, /repeatWeeks/)
  assert.match(src('lib/server/slotCreate.ts'), /autoApproveAt: Timestamp\.fromMillis\(autoApproveAtMs\(now, s, rules\)\), autoEligible/)
})

test('hold is staff only and blocks auto-approval', () => {
  const h = src('app/api/slots/hold/route.ts')
  assert.match(h, /requireDirector/)
  assert.match(src('lib/server/autoApprove.ts'), /d\.get\('held'\) !== true/)
  assert.match(src('lib/server/slotApproval.ts'), /held: r\.get\('held'\) === true/)
})
