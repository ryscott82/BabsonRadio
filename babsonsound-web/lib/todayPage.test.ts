import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { POLL_MS, DASHBOARD_URL, approveAllBody, approveAllLabel, canCopyEmail, criticalLines, flagWords, hostLine, isFlagged, moreWaiting, resultLines, startPolling, whyWaiting, type PendingRow } from './todayPage.ts'

const NOW = 1_800_000_000_000
const fmt = (ms: number) => `T+${ms - NOW}`
const row = (id: string, over: Partial<PendingRow> = {}): PendingRow => ({ id, title: `Show ${id}`, hostName: 'Sam', startAt: NOW + 1000, durationMin: 60, type: 'live', flags: [], held: false, autoApproveAt: NOW + 5000, autoBlockedReason: '', ...over })

test('the critical strip shows nothing when everything is ok', () => {
  assert.deepEqual(criticalLines({ siteDown: false, deadAir: false, serverTime: 'ok' }, 'admin'), [])
  assert.deepEqual(criticalLines(null, 'director'), [])
  assert.deepEqual(criticalLines(undefined, 'director'), [])
})

test('the critical strip has one line per problem, and links to Server load only for Admins', () => {
  const c = { siteDown: true, deadAir: true, serverTime: 'over' as const }
  assert.equal(criticalLines(c, 'admin').length, 3)
  assert.equal(criticalLines(c, 'admin').find(l => /Server time/.test(l.text))?.href, '/admin/server-load')
  assert.ok(criticalLines(c, 'director').every(l => l.href === null))
  assert.match(criticalLines({ siteDown: false, deadAir: false, serverTime: 'critical' }, 'admin')[0].text, /almost used up/)
})

test('why a request is waiting: hand review with the flag in words, or when it approves itself', () => {
  assert.equal(whyWaiting(row('a', { flags: ['explicit'] }), NOW, fmt), 'Needs hand review: explicit words')
  assert.equal(whyWaiting(row('a', { flags: ['minor', 'conflict'] }), NOW, fmt), 'Needs hand review: host is a minor, time conflict')
  assert.equal(whyWaiting(row('a', { held: true }), NOW, fmt), 'Held: needs hand review')
  assert.equal(whyWaiting(row('a'), NOW, fmt), 'Approves itself T+5000')
  assert.equal(whyWaiting(row('a', { autoBlockedReason: 'week-limit', autoApproveAt: null }), NOW, fmt), 'Waiting for staff (week limit)')
  assert.deepEqual(flagWords(['agreementUnsigned', 'cleanHours']), ['agreement not signed', 'clean-hours show'])
  assert.equal(isFlagged(row('a', { flags: ['explicit'] })), true); assert.equal(isFlagged(row('a')), false)
})

test('Approve all sends exactly the ids that were shown, in order, and nothing else', () => {
  const shown = [row('c'), row('a'), row('b')]
  assert.deepEqual(approveAllBody(shown), { ids: ['c', 'a', 'b'] })
  assert.deepEqual(Object.keys(approveAllBody(shown)), ['ids'])
  assert.equal(approveAllLabel(1), 'Approve 1 request'); assert.equal(approveAllLabel(4), 'Approve 4 requests')
})

test('Approve all results are listed per request in the order confirmed, with the reason for a skip', () => {
  const lines = resultLines([row('a'), row('b'), row('c')], [{ id: 'b', ok: false, reason: 'already handled' }, { id: 'a', ok: true }])
  assert.deepEqual(lines.map(l => l.text), ['Approved', 'Skipped: already handled', 'Skipped: no answer from the server'])
  assert.deepEqual(lines.map(l => l.ok), [true, false, false])
})

test('more requests than the list holds are reported', () => {
  assert.equal(moreWaiting(25, 20), 5); assert.equal(moreWaiting(3, 3), 0); assert.equal(moreWaiting(2, 5), 0)
})

test('Coming up offers a host name and a Copy email only for real shows, never an Auto DJ block', () => {
  assert.equal(hostLine({ title: 'x', startAt: 0, endAt: 1, source: 'auto', hostName: 'Hidden' }), '')
  assert.equal(hostLine({ title: 'x', startAt: 0, endAt: 1, source: 'slot', hostName: 'Sam' }), 'Sam')
  assert.equal(canCopyEmail({ title: 'x', startAt: 0, endAt: 1, source: 'slot', hostEmail: 'a@babson.edu' }), true)
  assert.equal(canCopyEmail({ title: 'x', startAt: 0, endAt: 1, source: 'slot' }), false)
  assert.equal(canCopyEmail({ title: 'x', startAt: 0, endAt: 1, source: 'auto', hostEmail: 'a@babson.edu' }), false)
})

// ── one call, every 60 seconds, only while the tab is visible ──
function fakeEnv(hidden = false) {
  let tick: (() => void) | null = null; let stopped = false
  const env = { hidden: () => hidden, every: (fn: () => void, ms: number) => { assert.equal(ms, POLL_MS); tick = fn; return () => { stopped = true } } }
  return { env, tick: () => tick?.(), stopped: () => stopped, hide: (h: boolean) => { hidden = h } }
}

test('Today polls every 60 seconds and never faster', () => { assert.equal(POLL_MS, 60_000) })

test('Today reads once on open, then once per tick while visible; a hidden tab is skipped', () => {
  const f = fakeEnv(); let calls = 0
  const stop = startPolling(() => { calls++ }, f.env)
  assert.equal(calls, 1)
  f.tick(); assert.equal(calls, 2)
  f.hide(true); f.tick(); f.tick(); assert.equal(calls, 2)
  f.hide(false); f.tick(); assert.equal(calls, 3)
  stop(); assert.equal(f.stopped(), true)
})

test('a tab that opens hidden does not read until it is visible', () => {
  const f = fakeEnv(true); let calls = 0
  startPolling(() => { calls++ }, f.env)
  assert.equal(calls, 0)
})

// ── source checks on the page itself ──
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const todayFiles = ['../app/admin/page.tsx', ...readdirSync(new URL('../components/admin/today/', import.meta.url)).map(f => `../components/admin/today/${f}`), './todayPage.ts']

test('no phone number is rendered or even read anywhere on Today', () => {
  for (const f of todayFiles) assert.doesNotMatch(read(f), /phone/i, f)
})

test('Today makes one data call on load: the dashboard (plus the Admin-only bug badge), no polling of anything else', () => {
  const page = read('../app/admin/page.tsx')
  assert.match(page, /apiGet<Dash>\(DASHBOARD_URL\)/)
  assert.equal(DASHBOARD_URL, '/api/admin/dashboard')
  assert.equal((page.match(/apiGet</g) ?? []).length, 2) // dashboard, and the one-time bug badge read
  assert.match(page, /if \(!user \|\| !isAdmin\) return\s+apiGet<\{ newReports/) // that second read is Admin only and not polled
  assert.equal((page.match(/setInterval/g) ?? []).length, 1) // only inside startPolling's env
  for (const f of todayFiles.filter(f => f.includes('today/'))) assert.doesNotMatch(read(f), /setInterval/, f)
  assert.doesNotMatch(page, /Notifications|StationPanel/)
})

test('the controls read nothing until a panel is opened, and More controls is drawn for Admins only', () => {
  const c = read('../components/admin/today/Controls.tsx')
  assert.match(c, /if \(needState && !d\)/)
  assert.match(c, /\{admin && \(/)
  assert.match(c, /audio-fx/); assert.match(c, /maintenance/)
  assert.doesNotMatch(c, /setInterval/)
})

test('Emergency stop asks first and the box says who is affected', () => {
  const c = read('../components/admin/today/Controls.tsx')
  assert.match(c, /setAsk\('emergency-stop'\)/)
  assert.match(c, /Every listener on the site and in the app loses the stream/)
})
