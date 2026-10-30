import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTO_CLOSE_MS, CODE_STEP_MS, FAILS_BEFORE_LOCK, badgeActive, badgeExpiry, canOpenCheckin, codeForWindow, codeMatches, csvCell, effectiveStatus,
  checkinGate, freshGuard, gradeQuiz, guardFail, guardOk, guardStep, juneEnd, memberGate, noticeDue, planGrants, quizGate, upcomingCodes, verifiedGate,
} from './studioRules.ts'

const S = 'secret-for-tests'
const T = Date.UTC(2026, 10, 3, 18, 0, 5) // inside a 30 s window

test('code: 6 digits, stable inside a window, changes next window, depends on the secret', () => {
  const c = codeForWindow(S, 1000)
  assert.match(c, /^\d{6}$/)
  assert.equal(c, codeForWindow(S, 1000))
  assert.notEqual(c, codeForWindow(S, 1001))
  assert.notEqual(c, codeForWindow('other', 1000))
})

test('code windows: current and previous are accepted, older and future are not', () => {
  const w = Math.floor(T / CODE_STEP_MS)
  assert.ok(codeMatches(S, codeForWindow(S, w), T))
  assert.ok(codeMatches(S, codeForWindow(S, w - 1), T))
  assert.ok(!codeMatches(S, codeForWindow(S, w - 2), T))
  assert.ok(!codeMatches(S, codeForWindow(S, w + 1), T))
  assert.ok(!codeMatches(S, '12345', T) && !codeMatches(S, 'abcdef', T) && !codeMatches(S, '', T))
  // 31 seconds later the old current code is the previous one and still works; 61 seconds later it does not
  assert.ok(codeMatches(S, codeForWindow(S, w), T + 31_000))
  assert.ok(!codeMatches(S, codeForWindow(S, w), T + 61_000))
})

test('trainer gets the current code plus the next ones, in order', () => {
  const c = upcomingCodes(S, T, 4)
  assert.equal(c.length, 4)
  assert.equal(c[0].code, codeForWindow(S, Math.floor(T / CODE_STEP_MS)))
  assert.equal(c[1].from, c[0].until)
})

test('check-in is open only until 15 minutes after the session ends', () => {
  const end = T
  assert.equal(effectiveStatus({ status: 'checkin_open', endsAt: end }, end + AUTO_CLOSE_MS), 'checkin_open')
  assert.equal(effectiveStatus({ status: 'checkin_open', endsAt: end }, end + AUTO_CLOSE_MS + 1), 'closed')
  assert.equal(effectiveStatus({ status: 'scheduled', endsAt: end }, end + 1e9), 'scheduled')
  assert.ok(canOpenCheckin({ status: 'scheduled', endsAt: end }, end))
  assert.ok(!canOpenCheckin({ status: 'scheduled', endsAt: end }, end + AUTO_CLOSE_MS + 1))
  assert.ok(!canOpenCheckin({ status: 'confirmed', endsAt: end }, end))
})

test('rate limit: 5 tries a minute, then wait; a new minute starts fresh', () => {
  let g = freshGuard()
  for (let i = 0; i < 5; i++) { const r = guardStep(g, T + i * 1000); assert.ok(r.ok); g = r.guard }
  const sixth = guardStep(g, T + 6000)
  assert.equal(sixth.ok, false)
  if (!sixth.ok) { assert.equal(sixth.why, 'rate'); assert.ok(sixth.retrySec > 0 && sixth.retrySec <= 60) }
  const later = guardStep(g, T + 61_000)
  assert.ok(later.ok)
})

test('lock: the 10th wrong code locks for 15 minutes, a right code resets the count', () => {
  let g = freshGuard()
  for (let i = 0; i < FAILS_BEFORE_LOCK - 1; i++) g = guardFail(g, T)
  assert.equal(g.lockUntil, 0)
  assert.equal(guardOk(g).fails, 0)
  g = guardFail(g, T)
  assert.equal(g.lockUntil, T + 15 * 60_000)
  const blocked = guardStep(g, T + 60_000)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.why, 'locked')
  assert.ok(guardStep(g, T + 15 * 60_000 + 1).ok)
})

test('expiry: next June 30 11:59 PM Eastern after the grant', () => {
  assert.equal(juneEnd(2027), Date.UTC(2027, 6, 1, 3, 59))
  assert.equal(badgeExpiry(Date.UTC(2026, 10, 3)), juneEnd(2027)) // November 2026
  assert.equal(badgeExpiry(Date.UTC(2027, 0, 15)), juneEnd(2027)) // January 2027
  assert.equal(badgeExpiry(Date.UTC(2027, 5, 29, 12)), juneEnd(2027)) // June 29
  assert.equal(badgeExpiry(Date.UTC(2027, 6, 1, 3, 58)), juneEnd(2027)) // 11:58 PM June 30 Eastern
  assert.equal(badgeExpiry(Date.UTC(2027, 6, 1, 4, 0)), juneEnd(2028)) // just after the deadline
  // the new NY year, not the UTC year, picks the date: 8 PM Dec 31 Eastern is already Jan 1 UTC
  assert.equal(badgeExpiry(Date.UTC(2027, 0, 1, 1, 0)), juneEnd(2027))
})

test('expiry: active before, inactive at and after; no date means not expiring yet', () => {
  const e = juneEnd(2027)
  assert.ok(badgeActive(e, e - 1))
  assert.ok(!badgeActive(e, e))
  assert.ok(!badgeActive(e, e + 1))
  assert.ok(badgeActive(null, e + 1e10))
  assert.ok(badgeActive(undefined, 0))
})

test('radio needs studio: held already, or granted in the same session', () => {
  assert.deepEqual(planGrants(['radio'], false), { ok: false })
  assert.deepEqual(planGrants(['radio'], true), { ok: true, badges: ['radio'] })
  assert.deepEqual(planGrants(['studio', 'radio'], false), { ok: true, badges: ['studio', 'radio'] })
  assert.deepEqual(planGrants(['studio'], false), { ok: true, badges: ['studio'] })
})

test('quiz grading: blanks are refused, pass mark applies', () => {
  const qs = [{ id: 'a', answer: 1 }, { id: 'b', answer: 0 }, { id: 'c', answer: 2 }, { id: 'd', answer: 3 }, { id: 'e', answer: 1 }]
  assert.equal(gradeQuiz(qs, { a: 1 }, 80), null)
  const ok = gradeQuiz(qs, { a: 1, b: 0, c: 2, d: 3, e: 0 }, 80)
  assert.deepEqual(ok, { percent: 80, passed: true, wrong: ['e'] })
  assert.equal(gradeQuiz(qs, { a: 0, b: 0, c: 2, d: 3, e: 0 }, 80)?.passed, false)
})

test('notices: 14 days out, and May 1 to 3, once each', () => {
  const exp = juneEnd(2027)
  const none = new Set<string>()
  assert.equal(noticeDue(exp, exp - 15 * 86_400_000, none), null)
  assert.equal(noticeDue(exp, exp - 14 * 86_400_000, none), 'd14')
  assert.equal(noticeDue(exp, exp - 14 * 86_400_000, new Set(['d14'])), null)
  assert.equal(noticeDue(exp, exp, none), null)
  const may1 = Date.UTC(2027, 4, 1, 14, 0)
  assert.equal(noticeDue(exp, may1, none), 'may1')
  assert.equal(noticeDue(exp, may1, new Set(['may1'])), null)
  assert.equal(noticeDue(exp, Date.UTC(2027, 4, 4, 14, 0), none), null)
  // a badge that expires next year gets no May notice this year
  assert.equal(noticeDue(juneEnd(2028), may1, none), null)
})

test('csv: quotes, and formulas are defused', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csvCell('+1 555'), "'+1 555")
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(5), '5')
})

const ME = { level: 'student', emailVerified: true, demo: false }

test('Guests are refused everywhere with BR-PERM-001', () => {
  for (const g of [memberGate('guest'), verifiedGate({ ...ME, level: 'guest' }), checkinGate({ ...ME, level: 'guest', status: 'checkin_open', row: null }), quizGate({ ...ME, level: 'guest', row: { confirmedAt: 1 } })]) {
    assert.equal(g.ok, false)
    if (!g.ok) { assert.equal(g.status, 403); assert.equal(g.code, 'BR-PERM-001') }
  }
  assert.equal(memberGate('student').ok, true)
})

test('check-in: verified Students only, open session only', () => {
  const code = (g: ReturnType<typeof checkinGate>) => (g.ok ? 'ok' : g.code)
  assert.equal(code(checkinGate({ ...ME, status: 'checkin_open', row: null })), 'ok')
  assert.equal(code(checkinGate({ ...ME, emailVerified: false, status: 'checkin_open', row: null })), 'BR-STU-002')
  assert.equal(code(checkinGate({ ...ME, emailVerified: false, demo: true, status: 'checkin_open', row: null })), 'ok')
  assert.equal(code(checkinGate({ ...ME, level: 'director', status: 'checkin_open', row: null })), 'BR-STU-012')
  assert.equal(code(checkinGate({ ...ME, status: 'scheduled', row: null })), 'BR-STU-004')
  assert.equal(code(checkinGate({ ...ME, status: 'closed', row: null })), 'BR-STU-004')
})

test('check-in: one per person per session, and a removed person stays out', () => {
  const code = (g: ReturnType<typeof checkinGate>) => (g.ok ? 'ok' : g.code)
  assert.equal(code(checkinGate({ ...ME, status: 'checkin_open', row: { checkedInAt: 5 } })), 'BR-STU-007')
  assert.equal(code(checkinGate({ ...ME, status: 'checkin_open', row: { removedAt: 5 } })), 'BR-STU-008')
  assert.equal(code(checkinGate({ ...ME, status: 'checkin_open', row: { removedAt: 5, checkedInAt: 4 } })), 'BR-STU-008')
  assert.equal(code(checkinGate({ ...ME, status: 'checkin_open', row: {} })), 'ok') // saved a spot, not checked in yet
})

test('no quiz or grant without a confirmed attendance row', () => {
  const code = (g: ReturnType<typeof quizGate>) => (g.ok ? 'ok' : g.code)
  assert.equal(code(quizGate({ ...ME, row: null })), 'BR-STU-013')
  assert.equal(code(quizGate({ ...ME, row: { checkedInAt: 1 } })), 'BR-STU-013') // checked in but not confirmed
  assert.equal(code(quizGate({ ...ME, row: { checkedInAt: 1, confirmedAt: 2, removedAt: 3 } })), 'BR-STU-013')
  assert.equal(code(quizGate({ ...ME, row: { checkedInAt: 1, confirmedAt: 2 } })), 'ok')
  assert.equal(code(quizGate({ ...ME, emailVerified: false, row: { confirmedAt: 2 } })), 'BR-STU-002')
})
