import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nyToMs } from './slotAuto.ts'
import {
  DEFAULT_STUDIO, LIVE_MAX_MINUTES, QUIET_WARNING, canSeeGuests, checkBookingTime, cleanGuests, holdsRoom, holdsStudio, isReleasable, liveLengthError, maskEmail, overlaps,
  parseQuiet, purgeAtMs, quietAt, quietInfo, quietRanges, quietUntil, quietNextStart, readStudioRules, upcomingHeld, withinCapacity, freeCancel,
} from './studioBookCore.ts'
import { BAN_LEVEL, counts, bannedUntilOf, isBanned, isLateCancel, levelOf, liveNoShow, prerecordedNoAudio, semesterEndMs, standingOf, strikeId } from './strikesCore.ts'
import { MIN_SHOWS, buildPopular, cellsFor, gridLevels, shouldRebuild, topWindows } from './popularCore.ts'
import { BY_KEY, SETTINGS, checkValue, defaultsOf, planPatch } from './adminSettings.ts'
import { csvCell, guestCsv } from './studioList.ts'
import { shapePending } from './todayData.ts'
import { attachProblem, cleanPath, cleanRecordingId, pcRecorderProblem } from './recordingsCore.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const R = DEFAULT_STUDIO
const NOW = nyToMs(2026, 11, 20, 12, 0)
const at = (m: number, d: number, h: number, min = 0) => nyToMs(2026, m, d, h, min) // Dec 1 2026 is a Tuesday, Dec 5 a Saturday
const ok = (startMs: number, durationMin: number, rules = R) => checkBookingTime({ startMs, durationMin, now: NOW, rules })

// ── studio hours, steps, length ─────────────────────────────
test('hours: 7:00 to 23:00 station time, a booking must fit inside', () => {
  assert.equal(ok(at(12, 1, 7), 60), null)
  assert.equal(ok(at(12, 1, 22), 60), null) // ends exactly 23:00
  assert.match(ok(at(12, 1, 6, 30), 30)!.message, /7:00 AM to 11:00 PM/)
  assert.ok(ok(at(12, 1, 22, 30), 60)) // would end 23:30
  assert.ok(ok(at(12, 1, 23), 30))
})
test('steps: starts on the hour or half hour, length in 30-minute steps', () => {
  assert.ok(ok(at(12, 1, 9, 15), 60))
  assert.equal(ok(at(12, 1, 9, 30), 60), null)
  assert.ok(ok(at(12, 1, 9), 45))
})
test('length: 30 to 90 minutes', () => {
  assert.ok(ok(at(12, 1, 9), 15)); assert.equal(ok(at(12, 1, 9), 30), null); assert.equal(ok(at(12, 1, 9), 90), null); assert.ok(ok(at(12, 1, 9), 120))
})
test('look-ahead 30 days, and not in the past', () => {
  assert.ok(ok(at(11, 20, 9), 30)) // before now (noon)
  assert.ok(ok(at(12, 25, 9), 30)) // 35 days
  assert.equal(ok(at(12, 18, 9), 30), null)
})
test('the rules come from settings and fall back to defaults when bad', () => {
  const r = readStudioRules({ capacity: 20, openHour: 8, closeHour: 8, maxMinutes: 9999, quiet: 'nonsense', semesterEnd: '2027-05-14' })
  assert.equal(r.capacity, 20); assert.equal(r.maxMinutes, 90); assert.equal(r.openHour, 7); assert.equal(r.closeHour, 23); assert.equal(r.quiet, R.quiet); assert.equal(r.semesterEnd, '2027-05-14')
  assert.equal(ok(at(12, 1, 8), 120, readStudioRules({ maxMinutes: 120 })), null)
})

// ── holds, overlap, live hold, capacity ─────────────────────
test('two holds: bookings count, finished or cancelled ones and live shows do not', () => {
  const t = at(12, 1, 9)
  const b = (status: string, off = 0) => ({ status, startAt: t + off, endAt: t + off + 3_600_000 })
  assert.equal(upcomingHeld([b('booked'), b('checked-in', 1e7)], NOW), 2)
  assert.equal(upcomingHeld([b('booked'), b('cancelled'), b('released'), b('completed')], NOW), 1)
  assert.equal(upcomingHeld([{ status: 'booked', startAt: NOW - 7_200_000, endAt: NOW - 3_600_000 }], NOW), 0)
  const s = src('lib/server/studioBook.ts')
  assert.match(s, /collection\('studioBookings'\)\.where\('uid', '==', t\.uid\)/) // the count is read from bookings only
  assert.match(s, /upcomingHeld\(mine\.docs[\s\S]*>= rules\.maxHolds/)
  assert.ok(!/upcomingHeld\([^)]*slotRequests/.test(s))
})
test('overlap: back to back is fine, any shared minute is not', () => {
  const a = { startAt: 0, endAt: 60 }
  assert.equal(overlaps(a, { startAt: 60, endAt: 120 }), false); assert.equal(overlaps(a, { startAt: 59, endAt: 120 }), true)
  assert.equal(holdsRoom({ status: 'booked', startAt: 0, endAt: 1 }), true); assert.equal(holdsRoom({ status: 'released', startAt: 0, endAt: 1 }), false)
  const s = src('lib/server/studioBook.ts')
  assert.match(s, /runTransaction[\s\S]*tx\.get\(db\.collection\('studioBookings'\)[\s\S]*tx\.set\(ref/) // checked inside the transaction
})
test('a live show holds the studio unless noStudio; pre-recorded never does', () => {
  assert.equal(holdsStudio({ type: 'live' }), true); assert.equal(holdsStudio({ type: 'live', noStudio: false }), true)
  assert.equal(holdsStudio({ type: 'live', noStudio: true }), false); assert.equal(holdsStudio({ type: 'prerecorded' }), false)
  const s = src('lib/server/studioBook.ts')
  assert.match(s, /overlapQuery\(db, new Date\(start\)/); assert.match(s, /where\('status', '==', 'pending'\)/) // approved live shows and pending live requests both hold it
  assert.match(src('lib/server/slotCreate.ts'), /holdsStudio\(\{ type: b\.type, noStudio: b\.noStudio \}\) && await studioBusy/) // and a live request cannot take a booked room
  assert.match(src('lib/server/slotApproval.ts'), /noStudio: r\.get\('noStudio'\) === true/)
})
test('capacity counts the booker: 12 people means 11 guests', () => {
  assert.equal(withinCapacity(11, 12), true); assert.equal(withinCapacity(12, 12), false)
  const g = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `G${i}`, email: `g${i}@x.com` }))
  assert.equal(cleanGuests(g(11), false, 12).ok, true)
  const bad = cleanGuests(g(12), false, 12); assert.equal(bad.ok, false)
  assert.equal(cleanGuests(g(2), false, 3).ok, true); assert.equal(cleanGuests(g(3), false, 3).ok, false)
})

// ── quiet hours ─────────────────────────────────────────────
test('quiet hours: Mon-Fri 10-16:30 and 23-7, Sat-Sun 2-8', () => {
  const q = R.quiet
  assert.equal(quietAt(q, at(12, 1, 10)), true); assert.equal(quietAt(q, at(12, 1, 9, 59)), false); assert.equal(quietAt(q, at(12, 1, 16, 29)), true); assert.equal(quietAt(q, at(12, 1, 16, 30)), false)
  assert.equal(quietAt(q, at(12, 1, 23)), true); assert.equal(quietAt(q, at(12, 1, 22, 59)), false); assert.equal(quietAt(q, at(12, 1, 6, 59)), true); assert.equal(quietAt(q, at(12, 1, 7)), false)
  assert.equal(quietAt(q, at(12, 5, 10)), false); assert.equal(quietAt(q, at(12, 5, 23)), false) // Saturday daytime and late evening are open
  assert.equal(quietAt(q, at(12, 5, 2)), true); assert.equal(quietAt(q, at(12, 5, 7, 59)), true); assert.equal(quietAt(q, at(12, 5, 8)), false) // Saturday 2-8
  assert.equal(quietAt(q, at(12, 6, 3)), true); assert.equal(quietAt(q, at(12, 6, 1)), false) // Sunday 2-8
  assert.equal(quietAt(q, at(12, 4, 23)), true) // Friday night
})
test('quiet hours never block: they only add { quiet, warning }', () => {
  assert.equal(ok(at(12, 1, 10), 60), null) // inside quiet hours, still allowed
  const i = quietInfo(R.quiet, at(12, 1, 10), at(12, 1, 11)); assert.equal(i.quiet, true); assert.equal(i.warning, QUIET_WARNING)
  const j = quietInfo(R.quiet, at(12, 5, 10), at(12, 5, 11)); assert.equal(j.quiet, false); assert.equal(j.warning, '')
  assert.equal(quietInfo(R.quiet, at(12, 1, 15), at(12, 1, 17)).quiet, true) // a block that only touches quiet hours is flagged
  const s = src('lib/server/studioBook.ts'); assert.ok(!/throw new HttpError[^\n]*quiet/i.test(s))
  assert.match(s, /quiet: info\.quiet, warning: info\.warning/); assert.match(src('lib/server/slotCreate.ts'), /quiet: q\.quiet, warning: q\.warning/)
  assert.match(src('app/api/booth/studio-status/route.ts'), /boothStudioStatus/); assert.match(s, /quiet: q, quietUntil: quietUntil/)
})
test('quiet helpers: spec parsing, quietUntil, ranges', () => {
  assert.equal(parseQuiet('x'), null); assert.deepEqual(parseQuiet(''), []); assert.equal(parseQuiet('Mon-Fri 9-9'), null); assert.ok(parseQuiet('Mon-Fri 10-16:30')); assert.equal(parseQuiet('Mon-Fri 10-16:75'), null); assert.equal(parseQuiet('Mon-Fri 9-25'), null)
  assert.equal(quietUntil(R.quiet, at(12, 1, 10)), at(12, 1, 16, 30)); assert.equal(quietUntil(R.quiet, at(12, 5, 10)), null)
  const rs = quietRanges(R.quiet, at(12, 1, 0), at(12, 2, 0)); assert.equal(rs.length >= 2, true)
  assert.equal(rs.every(r => r.endAt > r.startAt), true)
})

// ── release after the grace period ─────────────────────────
test('an unused booking releases 15 minutes after the start; checked-in and cancelled ones never do', () => {
  const start = at(12, 1, 9)
  assert.equal(isReleasable({ status: 'booked', startAt: start }, start + 14 * 60_000, 15), false)
  assert.equal(isReleasable({ status: 'booked', startAt: start }, start + 15 * 60_000, 15), true)
  for (const status of ['checked-in', 'cancelled', 'released', 'completed']) assert.equal(isReleasable({ status, startAt: start }, start + 3_600_000, 15), false)
  const s = src('lib/server/studioBook.ts')
  assert.match(s, /studioReleasedMail/); assert.match(s, /if \(rules\.studioNoShow\) await flagStrike/) // a strike only when the setting is on
  assert.equal(DEFAULT_STUDIO.studioNoShow, false)
  for (const f of ['app/api/studio/open/route.ts', 'app/api/studio/mine/route.ts', 'app/api/booth/studio-status/route.ts']) assert.match(src(f) + src('lib/server/studioBook.ts'), /releaseStale/)
  assert.equal(freeCancel(start, start - 2 * 3_600_000, 2), true); assert.equal(freeCancel(start, start - 119 * 60_000, 2), false)
})
test('no new crons: Hobby keeps its two, and lazy work runs inside existing runs', () => {
  const v = JSON.parse(src('vercel.json')); assert.equal(v.crons.length, 2)
  assert.match(src('app/api/cron/slots-auto/route.ts'), /runHousekeeping/); assert.match(src('app/api/cron/autoschedule/route.ts'), /runHousekeeping/)
})

// ── strikes ─────────────────────────────────────────────────
const NEXT_END = semesterEndMs('2026-12-18')
const confirmed = (n: number, exp = NEXT_END) => Array.from({ length: n }, (_, i) => ({ kind: 'late-cancel', status: 'confirmed', at: NOW - i * 1000, expiresAt: exp }))
test('detection only flags: every automatic strike is pending, never confirmed', () => {
  const s = src('lib/server/strikes.ts')
  assert.match(s, /status: o\.status \?\? 'pending'/)
  const scan = s.slice(s.indexOf('// ── detection'))
  assert.ok(!/confirmed/.test(scan)); assert.ok(!/status:/.test(scan.replace(/where\('status'/g, '')))
  assert.ok(!/status: 'confirmed'/.test(src('lib/server/studioBook.ts') + src('app/api/slots/cancel/route.ts')))
  assert.equal(counts({ kind: 'live-no-show', status: 'pending', at: 1 }, NOW), false)
  assert.equal(strikeId('live-no-show', 'abc'), strikeId('live-no-show', 'abc')) // flagging the same show twice is one strike
})
test('levels: 1 mistake, 2 warning, 3 semester ban', () => {
  assert.equal(standingOf([], NOW).label, 'Good standing')
  assert.equal(standingOf(confirmed(1), NOW).label, '1 mistake'); assert.equal(standingOf(confirmed(2), NOW).label, 'Warning')
  const three = standingOf(confirmed(3), NOW); assert.equal(three.level, BAN_LEVEL); assert.match(three.label, /^Banned until Dec 18, 2026$/); assert.equal(three.bannedUntil, NEXT_END)
  assert.equal(three.strikes.length, 3); assert.deepEqual(Object.keys(three.strikes[0]), ['date', 'reason'])
  assert.equal(levelOf([...confirmed(2), { kind: 'manual', status: 'pending', at: NOW }, { kind: 'manual', status: 'excused', at: NOW }], NOW), 2)
})
test('the ban blocks requests and bookings, and lifting a strike lifts it', () => {
  assert.equal(isBanned(NEXT_END, NOW), true); assert.equal(isBanned(NOW - 1, NOW), false); assert.equal(isBanned(undefined, NOW), false)
  assert.match(src('lib/server/studioBook.ts'), /assertNotBanned\(user, now\)\n[\s\S]*const start/) // bookings
  assert.match(src('lib/server/slotCreate.ts'), /assertNotBanned\(user, now\)/) // show requests (and repeats, which use the same code)
  assert.match(src('lib/server/studioBook.ts'), /'BR-STR-001'/)
  const lifted = confirmed(3).map((s, i) => (i === 0 ? { ...s, status: 'excused' } : s))
  assert.equal(levelOf(lifted, NOW), 2); assert.equal(bannedUntilOf(lifted, NOW), null)
  const st = src('lib/server/strikes.ts'); assert.match(st, /st !== 'pending' && st !== 'confirmed'/) // excusing a confirmed strike is the lift
  assert.match(st, /bannedUntil: until \? until : FieldValue\.delete\(\)/)
  assert.match(src('app/api/admin/strikes/decide/route.ts'), /requireDirector/)
})
test('strikes expire at the semester end', () => {
  assert.equal(counts(confirmed(1)[0], NEXT_END - 1), true); assert.equal(counts(confirmed(1)[0], NEXT_END + 1), false)
  assert.equal(levelOf(confirmed(3), NEXT_END + 1), 0); assert.equal(bannedUntilOf(confirmed(3), NEXT_END + 1), null)
  assert.equal(semesterEndMs('2026-12-18') > at(12, 18, 23, 59), true); assert.equal(semesterEndMs('2026-12-18') < at(12, 19, 0, 1), true)
  assert.match(src('lib/server/strikes.ts'), /expiresAt <= now\) throw new HttpError\(400, 'The semester end date/)
})
test('what is flagged: live with no connection, pre-recorded without audio, late cancel', () => {
  const slot = { startAt: NOW, endAt: NOW + 3_600_000 }, after = NOW + 3_600_000 + 11 * 60_000
  assert.equal(liveNoShow(slot, [], after), true); assert.equal(liveNoShow(slot, [{ from: NOW + 600_000, to: NOW + 1_200_000 }], after), false)
  assert.equal(liveNoShow(slot, [], NOW + 3_600_000 + 60_000), false) // not over yet
  assert.equal(prerecordedNoAudio({ startAt: NOW, audioURL: '', recordingId: '' }, NOW + 6 * 60_000), true)
  assert.equal(prerecordedNoAudio({ startAt: NOW, audioURL: 'https://x', recordingId: '' }, NOW + 6 * 60_000), false)
  assert.equal(prerecordedNoAudio({ startAt: NOW, audioURL: '', recordingId: 'r1' }, NOW + 6 * 60_000), false)
  assert.equal(isLateCancel(NOW + 23 * 3_600_000, NOW, 24), true); assert.equal(isLateCancel(NOW + 25 * 3_600_000, NOW, 24), false); assert.equal(isLateCancel(NOW + 1, NOW, 0), false)
  assert.match(src('lib/server/strikes.ts'), /azHistory\(slot\.startAt, slot\.endAt\)\)\.some\(r => r\.streamer\)/) // the stream history is the second signal
})
test('standing and strikes routes: who can call them', () => {
  assert.match(src('app/api/me/standing/route.ts'), /requireMember/)
  for (const f of ['app/api/admin/strikes/route.ts', 'app/api/admin/strikes/decide/route.ts', 'app/api/admin/strikes/add/route.ts', 'app/api/admin/studio/list/route.ts']) assert.match(src(f), /requireDirector/, f)
})

// ── live shows ──────────────────────────────────────────────
test('live shows are capped at 90 minutes; pre-recorded keep their cap; old shows are left alone', () => {
  assert.equal(LIVE_MAX_MINUTES, 90)
  assert.equal(liveLengthError('live', 90), null); assert.match(liveLengthError('live', 105)!, /up to 90 minutes/); assert.equal(liveLengthError('prerecorded', 240), null)
  assert.match(src('app/api/slots/request/route.ts'), /liveLengthError\(type, durationMin\)/); assert.match(src('app/api/slots/repeat/route.ts'), /liveLengthError/)
  assert.match(src('app/api/slots/options/route.ts'), /liveMaxMinutes: LIVE_MAX_MINUTES/)
  const approval = src('lib/server/slotApproval.ts'); assert.ok(!/liveLength|LIVE_MAX/.test(approval)) // approving or auto-approving never re-checks length
})

// ── guests ──────────────────────────────────────────────────
test('guests are required (or "just me"), validated and de-duplicated', () => {
  assert.equal(cleanGuests(undefined, false, 12).ok, false); assert.equal(cleanGuests([], false, 12).ok, false)
  const me = cleanGuests([], true, 12); assert.equal(me.ok && me.justMe, true)
  assert.equal(cleanGuests([{ name: 'A', email: 'a@x.com' }], true, 12).ok, false) // both
  assert.equal(cleanGuests([{ name: 'A', email: 'nope' }], false, 12).ok, false)
  assert.equal(cleanGuests([{ name: '', email: 'a@x.com' }], false, 12).ok, false)
  assert.equal(cleanGuests([{ name: 'x'.repeat(61), email: 'a@x.com' }], false, 12).ok, false)
  const d = cleanGuests([{ name: 'A', email: 'A@X.com' }, { name: 'A again', email: 'a@x.com' }, { name: 'Out', email: 'friend@gmail.com' }], false, 12)
  assert.equal(d.ok && d.guests.length, 2) // outside (non-Babson) emails are allowed
  const pick = cleanGuests([{ id: 'u:abc', name: '', email: '' }], false, 12); assert.equal(pick.ok, true)
  for (const f of ['app/api/studio/book/route.ts', 'app/api/slots/request/route.ts']) assert.match(src(f), /cleanGuests\(b\.guests, b\.justMe/, f)
  assert.match(src('app/api/slots/request/route.ts'), /policyAck !== true/); assert.match(src('app/api/studio/book/route.ts'), /policyAck !== true/)
  assert.match(src('lib/server/studioBook.ts'), /policyAck: true, policyVersion: POLICY_VERSION/); assert.match(src('lib/server/slotCreate.ts'), /policyVersion: POLICY_VERSION/)
})
test('guest lists are hidden from other students and from public data', () => {
  assert.equal(canSeeGuests('student', 'u1', 'u2'), false); assert.equal(canSeeGuests('student', 'u1', 'u1'), true)
  assert.equal(canSeeGuests('director', 'u1', 'u2'), true); assert.equal(canSeeGuests('admin', 'u1', 'u2'), true); assert.equal(canSeeGuests('guest', 'u1', 'u2'), false)
  assert.match(src('app/api/slots/mine/route.ts'), /where\('requesterUid', '==', t\.uid\)/) // a student reads only their own requests
  assert.ok(!/guests/.test(src('lib/server/slotApproval.ts').replace(/noStudio/g, ''))) // airSlots (readable by every member) never carries guests
  for (const f of ['app/api/studio/open/route.ts', 'app/api/admin/dashboard/route.ts', 'app/api/slots/open/route.ts', 'app/api/booth/studio-status/route.ts']) assert.ok(!/guests/.test(src(f)), f)
  assert.ok(!/guests/.test(src('lib/server/studioBook.ts').slice(src('lib/server/studioBook.ts').indexOf('export async function openGrid'), src('lib/server/studioBook.ts').indexOf('// ── booth')))) // the grid
  assert.match(src('app/api/admin/studio/list/route.ts'), /requireDirector/); assert.match(src('app/api/admin/slot-requests/route.ts'), /requireDirector/)
  const rules = src('firestore.rules')
  for (const c of ['studioBookings', 'strikes', 'recordings', 'clubEvents', 'guestHistory', 'popularTimes']) assert.match(rules, new RegExp(`match /${c}/\\{id\\}\\s+\\{ allow read, write: if false; \\}`), c)
  assert.match(rules, /match \/slotRequests\/\{id\}[\s\S]*requesterUid == request\.auth\.uid \|\| isStaff\(\) \|\| isDirector\(\)/)
})
test('guest details are deleted 90 days after the date, inside an existing run', () => {
  assert.equal(purgeAtMs(NOW), NOW + 90 * 86_400_000)
  const h = src('lib/server/housekeeping.ts')
  assert.match(h, /\['studioBookings', 'slotRequests'\]/); assert.match(h, /where\('purgeAt', '<=', Timestamp\.fromMillis\(now\)\)/); assert.match(h, /guests: \[\]/)
  assert.match(src('lib/server/studioBook.ts'), /\.\.\.\(i\.guests\.length \? \{ purgeAt/); assert.match(src('lib/server/slotCreate.ts'), /b\.guests\.length \? \{ purgeAt/)
})
test('the guest list export: one row per guest, spreadsheet formulas defused', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`); assert.equal(csvCell('a"b'), '"a""b"'); assert.equal(csvCell('line\nbreak'), '"line break"')
  const csv = guestCsv([
    { kind: 'studio', startAt: NOW, endAt: NOW + 1, hostName: 'Ann', hostEmail: 'a@babson.edu', title: 'Studio booking', status: 'booked', guests: [{ name: 'Bo', email: 'bo@x.com' }, { name: '=evil', email: 'e@x.com' }], justMe: false },
    { kind: 'live', startAt: NOW, endAt: NOW + 1, hostName: 'Cy', hostEmail: 'c@babson.edu', title: 'Show', status: 'approved', guests: [], justMe: true },
  ])
  const lines = csv.trim().split('\r\n'); assert.equal(lines.length, 4); assert.match(lines[2], /"'=evil"/); assert.match(lines[3], /\(just me\)/)
})

// ── suggestions ─────────────────────────────────────────────
test('suggestions never return another person\'s email', () => {
  assert.equal(maskEmail('ryan.scott@babson.edu'), 'r***@b***.edu'); assert.ok(!maskEmail('ryan.scott@babson.edu').includes('ryan'))
  const s = src('app/api/people/suggest/route.ts')
  assert.ok(!/[{,]\s*email\s*[:,}]/.test(s), 'no object returned with an email field'); assert.match(s, /emailMasked: maskEmail\(email\)/)
  assert.match(s, /q\.length < 2/); assert.match(s, /slice\(0, 5\)/); assert.match(s, /requireStudent/); assert.match(s, /429/)
  assert.match(s, /d\.get\('level'\) === 'guest'/); assert.match(s, /d\.get\('suggestable'\) === false/) // guests and opted-out people are left out
  assert.match(s, /where\('nameLower', '>=', q\)/) // a cheap prefix query, no scan
  assert.match(src('lib/server/studioBook.ts'), /g\.id\.startsWith\('u:'\)[\s\S]*get\('email'\)/) // the server looks the email up itself
})

// ── popular times ───────────────────────────────────────────
test('popular times: averages only, station-wide fallback, rebuilt at most weekly and lazily', () => {
  const HOUR = 3_600_000, start = at(12, 1, 20) // Tuesday 8 pm
  const rec = (h: number, label: string, listenerMin: number) => ({ hourStart: start + h * HOUR, label, listenerMin })
  const shows = (n: number, cat: string) => Array.from({ length: n }, (_, i) => ({ category: cat, title: `Show ${i}`, startAt: start + i * 7 * 86_400_000, endAt: start + i * 7 * 86_400_000 + HOUR }))
  const records = Array.from({ length: 3 }, (_, i) => rec(i * 168, `Show ${i}`, 120)) // 120 listener-minutes = 2 listeners on average
  const doc = buildPopular(shows(3, 'music'), records, NOW)
  assert.equal(JSON.stringify(doc).includes('Show 0'), false) // no titles, no people: aggregates only
  const idx = 2 * 24 + 20
  assert.equal(doc.categories.music.shows, 3); assert.equal(doc.categories.music.cells[idx], 2); assert.equal(doc.station[idx], 2)
  const few = buildPopular(shows(MIN_SHOWS - 1, 'talk'), records, NOW)
  assert.equal(few.categories.talk.cells.every(c => c === null), true)
  const c = cellsFor(few, 'talk'); assert.equal(c.fallback, true); assert.equal(c.cells[idx], few.station[idx] ?? 0)
  assert.equal(cellsFor(doc, 'music').fallback, false); assert.equal(cellsFor(doc, 'unknown').fallback, true)
  const lv = gridLevels(cellsFor(doc, 'music').cells); assert.equal(lv.length, 7); assert.equal(lv[0].length, 24); assert.equal(lv[2][20], 3)
  assert.equal(topWindows(cellsFor(doc, 'music').cells, 3)[0].day, 2)
  assert.equal(shouldRebuild(NOW - 6 * 86_400_000, NOW), false); assert.equal(shouldRebuild(NOW - 7 * 86_400_000, NOW), true); assert.equal(shouldRebuild(null, NOW), true)
  const o = src('app/api/slots/options/route.ts'); assert.match(o, /after\(\(\) => maybeRebuildPopular/)
  for (const f of ['app/api/cron/autoschedule/route.ts', 'app/api/cron/slots-auto/route.ts', 'app/api/cron/birthdays/route.ts']) assert.ok(!/popular/i.test(src(f)), f)
  assert.match(src('lib/server/popularTimes.ts'), /runTransaction/) // one instance builds at a time
  assert.match(src('app/api/slots/popular/route.ts'), /max-age=300/)
})

// ── recordings ──────────────────────────────────────────────
test('attaching a recording needs the clean tick, an owner and an upcoming pre-recorded show', () => {
  const base = { cleanConfirmed: true, recOwner: 'u1', reqOwner: 'u1', uid: 'u1', recStatus: 'uploaded', reqType: 'prerecorded', reqStatus: 'approved', reqStart: NOW + 1e6, now: NOW }
  assert.equal(attachProblem(base), null)
  assert.equal(attachProblem({ ...base, cleanConfirmed: false })!.code, 'BR-REC-002'); assert.equal(attachProblem({ ...base, cleanConfirmed: 'true' })!.code, 'BR-REC-002')
  assert.equal(attachProblem({ ...base, recOwner: 'u2' })!.code, 'BR-REC-001'); assert.equal(attachProblem({ ...base, recStatus: 'recording' })!.code, 'BR-REC-001')
  for (const o of [{ reqType: 'live' }, { reqOwner: 'u2' }, { reqStatus: 'declined' }, { reqStart: NOW - 1 }]) assert.equal(attachProblem({ ...base, ...o })!.code, 'BR-REC-003')
  const r = src('lib/server/recordings.ts'), fn = r.slice(r.indexOf('export async function attachRecording'))
  assert.ok(fn.indexOf('attachProblem(') < fn.indexOf('runTransaction')) // checked before anything is written
  assert.match(src('app/api/recordings/attach/route.ts'), /attachRecording\(adminDb\(\), t\.uid/)
  assert.equal(cleanPath('Student recordings/a.mp3'), 'Student recordings/a.mp3'); assert.equal(cleanPath('../x'), ''); assert.equal(cleanPath('/etc/x'), '')
})
test('recordings: the website only stores details, and the right people can call each route', () => {
  const rec = src('lib/server/recordings.ts'); assert.ok(!/azUploadChunk|file_data|formData/i.test(rec)) // no audio through Vercel functions
  for (const f of ['app/api/booth/recordings/start/route.ts', 'app/api/booth/recordings/complete/route.ts']) assert.match(src(f), /await recordingCaller\(req, b\)/, f)
  const who = src('lib/server/boothRecordings.ts')
  assert.match(who, /requireStudioBadge\(t\)/); assert.match(who, /verifyAttest\(secret/); assert.match(who, /pcRecorderProblem\(c, now, RECORDING_TOKEN_MAX_AGE_MS\)/)
  assert.match(src('app/api/booth/session/route.ts'), /r: canRecord/)
  assert.match(src('app/api/booth/recordings/complete/route.ts'), /recordingReadyMail/)
  assert.match(src('app/api/recordings/[id]/route.ts'), /staff: a\.level === 'director' \|\| a\.level === 'admin'/)
  assert.match(src('lib/server/slotApproval.ts'), /airRecording\(db, requestId\)/) // approving a show schedules its recording
  assert.match(src('app/api/slots/cancel/route.ts'), /releaseRecording/); assert.match(src('app/api/slots/decision/route.ts'), /releaseRecording/)
})
test('studio PC recordings: the PC may act for the person only with their signed token that allows recording, up to 14 days old', () => {
  const day = 86_400_000
  assert.equal(pcRecorderProblem({ u: 'u1', r: true, exp: NOW - 13 * day }, NOW, 14 * day), null)
  assert.equal(pcRecorderProblem({ u: 'u1', r: true, exp: NOW - 15 * day }, NOW, 14 * day)!.code, 'BR-BTH-002')
  assert.equal(pcRecorderProblem({ u: 'u1', r: false, exp: NOW + 1 }, NOW, 14 * day)!.code, 'BR-BKG-007')
  assert.equal(pcRecorderProblem({ u: 'u1', exp: NOW + 1 }, NOW, 14 * day)!.code, 'BR-BKG-007') // tokens from before this change can't record
  assert.equal(pcRecorderProblem(null, NOW, 14 * day)!.code, 'BR-BTH-002')
  assert.equal(cleanRecordingId('AbCdEfGhIjKlMnOpQrSt'), 'AbCdEfGhIjKlMnOpQrSt'); assert.equal(cleanRecordingId('short'), ''); assert.equal(cleanRecordingId('a/b/c/d/e/f/g/h'), '')
  const st = src('app/api/booth/recordings/start/route.ts'); assert.match(st, /tx\.create\(ref, doc\)/) // retried calls never make a second record
  const c = src('app/api/booth/recordings/complete/route.ts'); assert.match(c, /r\.forRequestId && r\.clean/); assert.match(c, /attachRecording\(db, who\.uid, id, r\.forRequestId, true\)/)
})
test('booth status: next quiet start and bookings with ids; check-in reports a booking that is already checked in', () => {
  assert.equal(quietNextStart(R.quiet, at(12, 1, 8, 50)), at(12, 1, 10)); assert.equal(quietNextStart(R.quiet, at(12, 1, 10)), null)
  assert.equal(quietNextStart(R.quiet, at(12, 1, 17)), at(12, 1, 23)); assert.equal(quietNextStart(R.quiet, at(12, 5, 12)), at(12, 6, 2)) // Saturday noon -> Sunday 2 am
  assert.equal(quietNextStart('', at(12, 1, 10)), null)
  const s = src('lib/server/studioBook.ts')
  assert.match(s, /quietStartsAt: quietNextStart\(rules\.quiet, now\)/); assert.match(s, /\{ id: r\.id, startAt: r\.startAt, endAt: r\.endAt, name: r\.name\.split/)
  assert.match(s, /open\[0\] \? \{ ok: true, checkedIn: false, bookingId: open\[0\]\.id \}/)
})
test('club events: public read, E-board and Admin write', () => {
  const e = src('app/api/events/club/route.ts')
  assert.ok(!/requireDirector/.test(e.slice(e.indexOf('export async function GET'), e.indexOf('export async function POST'))))
  assert.equal((e.match(/requireDirector\(req\)/g) ?? []).length, 2); assert.match(e, /s-maxage=300/)
})

// ── settings ────────────────────────────────────────────────
test('settings: studio and strikes rows, bounds, date and quiet text', () => {
  const keys = ['studio.capacity', 'studio.openHour', 'studio.closeHour', 'studio.minMinutes', 'studio.maxMinutes', 'studio.maxHolds', 'studio.lookAheadDays', 'studio.cancelHours', 'studio.graceMinutes', 'studio.quiet', 'strikes.studioNoShow', 'strikes.semesterEnd', 'strikes.lateCancelHours']
  for (const k of keys) { const d = BY_KEY.get(k)!; assert.ok(d, k); assert.equal(d.store, 'studio'); assert.equal(checkValue(d, d.default).ok, true, k) }
  assert.equal(BY_KEY.get('studio.capacity')!.visible, 'main'); assert.equal(BY_KEY.get('studio.capacity')!.default, 12)
  assert.deepEqual(keys.filter(k => k !== 'studio.capacity' && BY_KEY.get(k)!.visible !== 'expert'), [])
  const d = defaultsOf(); assert.equal(d['studio.openHour'], 7); assert.equal(d['studio.closeHour'], 23); assert.equal(d['studio.maxMinutes'], 90); assert.equal(d['studio.maxHolds'], 2)
  assert.equal(d['studio.graceMinutes'], 15); assert.equal(d['strikes.studioNoShow'], false); assert.equal(d['strikes.lateCancelHours'], 24)
  const cap = BY_KEY.get('studio.capacity')!; assert.equal(checkValue(cap, 0).ok, false); assert.equal(checkValue(cap, 51).ok, false); assert.equal(checkValue(cap, 50).ok, true)
  const date = BY_KEY.get('strikes.semesterEnd')!; assert.equal(date.kind, 'date'); assert.equal(checkValue(date, '2027-05-14').ok, true)
  for (const bad of ['2027-02-30', '05/14/2027', '', 20270514]) assert.equal(checkValue(date, bad).ok, false, String(bad))
  const quiet = BY_KEY.get('studio.quiet')!; assert.equal(checkValue(quiet, 'Sat-Sun 0-6').ok, true); assert.equal(checkValue(quiet, 'whenever').ok, false); assert.equal(checkValue(quiet, 'x'.repeat(130)).ok, false)
  assert.equal(planPatch(defaultsOf(), { 'studio.openHour': 23 }).errors.length > 0, true) // open must be before close
  assert.equal(planPatch(defaultsOf(), { 'studio.maxMinutes': 30, 'studio.minMinutes': 60 }).errors.length > 0, true)
  const p = planPatch(defaultsOf(), { 'studio.capacity': 20, 'strikes.semesterEnd': '2027-05-14' }); assert.deepEqual(p.changes.map(c => c.key), ['studio.capacity', 'strikes.semesterEnd'])
  assert.equal(planPatch(defaultsOf(), { 'studio.capacity': null }).changes.length, 0) // reset to default = no change from default
  assert.equal(SETTINGS.filter(s => s.store === 'studio').length, 13)
  assert.match(src('lib/server/adminSettings.ts'), /resetStudioRules\(\)/)
})

// ── dashboard, booth, docs ──────────────────────────────────
test('the dashboard rows carry only a strike count', () => {
  const p = { id: 'r1', title: 't', description: '', location: '', requesterName: 'A', requesterUid: 'u1', startAt: NOW, durationMin: 30, type: 'live', autoApproveAt: null, autoBlockedReason: '', held: false, cleanHours: false, conductSigned: true }
  const row = shapePending([p], () => false, () => false, u => (u === 'u1' ? 2 : 0)).rows[0]
  assert.equal(row.strikes, 2); assert.equal(shapePending([p], () => false, () => false).rows[0].strikes, 0)
  const d = src('app/api/admin/dashboard/route.ts'); assert.match(d, /'strikeLevel', 'strikeUntil'/); assert.ok(!/collection\('strikes'\)/.test(d)) // no extra read
})
test('the studio PC endpoints: walk-ins need nothing, the page does not poll', () => {
  const s = src('lib/server/studioBook.ts')
  assert.match(s, /if \(!mine\) return open\[0\] \? \{ ok: true, checkedIn: false, bookingId: open\[0\]\.id \} : \{ ok: true, checkedIn: false \}/)
  assert.match(s, /now - statusCache\.at < 60_000/); assert.match(src('app/api/booth/studio-status/route.ts'), /at most\s+\/\/ every 5 minutes|at most every 5 minutes/)
  assert.match(src('lib/server/booth.ts'), /x-booth-nonce/)
})
test('every error code the new routes use is documented', () => {
  const codes = new Set<string>(JSON.parse(src('lib/error-codes.json')).map((c: { code: string }) => c.code))
  const files = ['lib/server/studioBook.ts', 'lib/server/strikes.ts', 'lib/server/recordings.ts', 'app/api/studio/book/route.ts', 'app/api/studio/cancel/route.ts', 'app/api/slots/request/route.ts', 'app/api/slots/repeat/route.ts', 'app/api/recordings/attach/route.ts', 'app/api/events/club/route.ts', 'app/api/booth/recordings/start/route.ts', 'app/api/booth/recordings/complete/route.ts', 'lib/server/boothRecordings.ts', 'lib/recordingsCore.ts']
  for (const f of files) for (const m of src(f).matchAll(/BR-[A-Z]{3}-\d{3}/g)) assert.ok(codes.has(m[0]), `${m[0]} in ${f}`)
})
