import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONTROL_BUTTONS, MORE_SWITCHES, buttonsFor } from './controlButtons.ts'
import { BROADCAST_GAP_MS, broadcastAudit, broadcastWait } from './broadcastGuard.ts'
import { ALL_CLEAR, canSend, clip, confirmBody, goesTo, unreadCount } from './notificationsPage.ts'
import { studentShows } from './todayPage.ts'
import { emptyForm, quickSave } from './usageForm.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const MIN = 60_000

// ── icon buttons ──
test('the control row is the seven buttons from the design, plus More for Admins', () => {
  assert.deepEqual(CONTROL_BUTTONS.map(b => b.label), ['Skip song', 'Emergency stop', 'Resume', 'ON AIR sign', 'Color mode', 'Announcement', 'Play a song next', 'More'])
  assert.deepEqual(buttonsFor('director').map(b => b.label), ['Skip song', 'Emergency stop', 'Resume', 'ON AIR sign', 'Color mode', 'Announcement', 'Play a song next'])
  assert.equal(buttonsFor('admin').length, 8)
})
test('every icon button has a name and a tooltip line; only Emergency stop is red; the switches are marked as toggles', () => {
  for (const b of [...CONTROL_BUTTONS, ...MORE_SWITCHES]) { assert.ok(b.label.length > 1, b.id); assert.ok(b.tip.length > 3, b.id) }
  assert.deepEqual(CONTROL_BUTTONS.filter(b => 'red' in b && b.red).map(b => b.id), ['emergency-stop'])
  assert.deepEqual(CONTROL_BUTTONS.filter(b => b.toggle).map(b => b.id), ['sign', 'color', 'announce'])
})
test('the icon button draws aria-label, its name beside the icon, a short tooltip on hover and keyboard focus, and a filled icon when on', () => {
  const ib = src('components/admin/IconButton.tsx')
  assert.match(ib, /aria-label=\{`\$\{label\}\$\{state\}`\}/)
  assert.match(ib, /<span className="text-lg leading-tight">\{label\}<\/span>/) // the name, always shown, no description
  assert.match(ib, /role="tooltip"/)
  assert.match(ib, /group-hover:opacity-100/); assert.match(ib, /group-focus-within:opacity-100/)
  assert.match(ib, /filled=\{on === true\}/)
  assert.match(ib, /ops-btn-red/)
  assert.doesNotMatch(ib, /text-(xs|sm)\b/) // 16 px or larger
})
test('Controls renders every button through IconButton, and Emergency stop and Resume still ask first', () => {
  const c = src('components/admin/today/Controls.tsx')
  assert.match(c, /<IconButton key=\{b\.id\}/)
  assert.match(c, /label=\{b\.label\}/); assert.match(c, /tip=\{b\.tip\}/); assert.match(c, /on=\{on\(b\.id\)\}/)
  assert.match(c, /if \(id === 'emergency-stop' \|\| id === 'resume'\) return setAsk\(id\)/)
  assert.match(c, /Every listener on the site and in the app loses the stream/)
  assert.doesNotMatch(c, /<button[^>]*>\s*<span className="text-2xl/) // no more big text buttons
})

// ── home layout ──
test('wide screens: Needs approval is the whole right column, sticky and scrolling inside itself; phones: below the controls', () => {
  const page = src('app/admin/page.tsx'), na = src('components/admin/today/NeedsApproval.tsx')
  assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_26rem\]/)
  assert.match(page, /<aside aria-label="Needs approval column"[^>]*xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-0/)
  assert.match(na, /xl:h-screen xl:flex xl:flex-col/); assert.match(na, /xl:overflow-y-auto/)
  assert.ok(na.indexOf('Approve all</button>') < na.indexOf('<ul className="divide-y'), 'Approve all sits at the top, above the list')
  const iControls = page.indexOf('<Controls role={role} />'), iNeeds = page.indexOf('<NeedsApproval'), iComing = page.indexOf('<ComingUp')
  assert.ok(iControls > 0 && iControls < iNeeds && iNeeds < iComing)
})
test('Coming up lists student-run shows only; Auto DJ blocks are not shown', () => {
  const rows = [{ title: 'Morning Show', startAt: 1, endAt: 2, source: 'request' }, { title: 'Auto DJ', startAt: 2, endAt: 3, source: 'auto' }, { title: 'Sports', startAt: 3, endAt: 4, source: 'manual' }]
  assert.deepEqual(studentShows(rows).map(r => r.title), ['Morning Show', 'Sports'])
  assert.match(src('components/admin/today/ComingUp.tsx'), /studentShows\(all\)/)
  assert.doesNotMatch(src('components/admin/today/ComingUp.tsx'), /Auto DJ/)
})

// ── server load quick entry ──
const good = { date: '2026-11-09', cpu: '1h 30m', edge: '1.2M', invocations: '40K', gb: '3.2 GB' }
test('quick entry builds exactly one add from the same validation as the full form', () => {
  const r = quickSave(good, '2026-11-09')
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.body.action, 'add'); assert.equal(r.body.activeCpuHours, 1.5); assert.equal(r.body.date, '2026-11-09'); assert.equal(r.body.edgeRequests, 1_200_000) }
  const full = emptyForm('2026-11-09'); assert.equal(Object.keys(full).includes('cpu'), true)
})
test('quick entry sends nothing when a box is wrong, and says which', () => {
  const r = quickSave({ ...good, cpu: 'lots', gb: '' }, '2026-11-09')
  assert.equal(r.ok, false)
  assert.ok(r.errors.cpu); assert.ok(r.errors.gb)
  assert.equal(quickSave({ ...good, date: '2026-11-30' }, '2026-11-09').ok, false)
})
test('the quick entry posts once to the existing endpoint, is the first thing on the page, and the long form is collapsed under "Full entry form"', () => {
  const q = src('components/admin/usage/QuickEntry.tsx'), page = src('app/admin/server-load/page.tsx')
  assert.equal((q.match(/api\(/g) ?? []).length, 1)
  assert.match(q, /api\('\/api\/admin\/server-usage', r\.body\)/)
  assert.match(q, /quickSave\(q, today, entries\)/)
  assert.match(q, /onDone\(/) // the page reloads the meter and forecast
  assert.match(q, /Last reading:/)
  assert.match(q, /useState\(\{ date: today,/) // today's date prefilled
  assert.ok(page.indexOf('<QuickEntry') < page.indexOf('<Charts') && page.indexOf('<QuickEntry') < page.indexOf('<TierPanel'))
  assert.match(page, /<summary[^>]*>Full entry form<\/summary>/)
  assert.doesNotMatch(page, /max-w-/)
  assert.match(page, /const changed = async \(m: string\) => \{ setMsg\(m\); setEditing\(null\); await load\(\) \}/)
})

// ── notifications ──
test('the send confirmation repeats the title, the message and the count, and says it cannot be undone', () => {
  const body = confirmBody({ title: '  Live at six ', body: 'Quad set tonight' }, 412)
  assert.match(body, /Title: Live at six/); assert.match(body, /Message: Quad set tonight/); assert.match(body, /Goes to 412 phones/); assert.match(body, /cannot be undone/)
  assert.equal(goesTo(1), 'Goes to 1 phone')
  const page = src('app/admin/notifications/page.tsx')
  assert.match(page, /confirmBody\(draft, phones \?\? 0\)/); assert.match(page, /<ConfirmDialog/); assert.match(page, /Goes to|goesTo\(phones\)/)
})
test('the composer: limits 60 and 160, both parts needed, someone to receive it, a live preview', () => {
  assert.deepEqual(clip({ title: 'x'.repeat(80), body: 'y'.repeat(200) }), { title: 'x'.repeat(60), body: 'y'.repeat(160) })
  assert.equal(canSend({ title: 'A', body: 'B' }, 3), true)
  assert.equal(canSend({ title: '', body: 'B' }, 3), false); assert.equal(canSend({ title: 'A', body: ' ' }, 3), false); assert.equal(canSend({ title: 'A', body: 'B' }, 0), false)
  assert.match(src('app/admin/notifications/page.tsx'), /aria-label="Preview"/)
})
test('the Notifications page is for E-board and Admin, shows All clear, reuses the inbox, refreshes every 60 s only while visible, and shows the server sentence', () => {
  const page = src('app/admin/notifications/page.tsx')
  assert.match(page, /isDirector/); assert.doesNotMatch(page, /isAdmin/)
  assert.equal(ALL_CLEAR, 'All clear'); assert.match(page, /emptyText=\{ALL_CLEAR\}/)
  assert.match(page, /import Notifications, \{ type Notice \} from '@\/components\/admin\/Notifications'/)
  assert.match(page, /startPolling\(loadAlerts/); assert.match(page, /hidden: \(\) => document\.hidden/)
  assert.equal((page.match(/setInterval/g) ?? []).length, 1)
  assert.match(page, /setError\(e instanceof Error \? e\.message/) // the server's own sentence
  assert.equal(unreadCount([1, 2, 3]), 3); assert.equal(unreadCount(null), 0)
  assert.doesNotMatch(page, /deviceTokens|api\/me\/push|api\/admin\/push/) // no invented storage for "which alerts reach my phone"
})

// ── broadcast ──
test('broadcast: E-board and Admin only; the guard runs before anything is sent', () => {
  const route = src('app/api/admin/broadcast/route.ts'), http = src('lib/server/http.ts')
  assert.equal((route.match(/requireDirector\(req\)/g) ?? []).length, 2) // GET and POST
  assert.doesNotMatch(route, /requireStaff|requireAdmin|requireUser\(/)
  assert.match(http, /requireDirector = \(req: Request\) =>\s+need\(req, a => a\.level === 'director' \|\| a\.level === 'admin'/) // students and guests get 403
  assert.ok(route.indexOf('broadcastWait(') < route.indexOf('notifyAnnouncements({'))
  assert.match(route, /BROADCAST_TITLE_MAX/); assert.match(route, /BROADCAST_BODY_MAX/)
})
test('broadcast limit: one per person every 10 minutes, with a clear sentence; other people are not blocked', () => {
  assert.equal(BROADCAST_GAP_MS, 10 * MIN)
  const now = 1_000_000_000_000
  assert.equal(broadcastWait([], 'u1', now), null)
  assert.match(broadcastWait([{ by: 'u1', at: now - 3 * MIN }], 'u1', now) ?? '', /You can send another in 7 minutes\./)
  assert.match(broadcastWait([{ by: 'u1', at: now - 9.5 * MIN }], 'u1', now) ?? '', /in 1 minute\./)
  assert.equal(broadcastWait([{ by: 'u1', at: now - 10 * MIN }], 'u1', now), null)
  assert.equal(broadcastWait([{ by: 'u2', at: now - 1 * MIN }], 'u1', now), null)
  assert.match(src('app/api/admin/broadcast/route.ts'), /throw new HttpError\(429, wait\)/)
})
test('broadcast audit: each send writes a hostActions line with uid, action, title, recipient count and time', () => {
  const at = { t: 1 }
  assert.deepEqual(broadcastAudit('u1', 'Live at six', 412, at), { uid: 'u1', action: 'broadcast', title: 'Live at six', recipients: 412, show: '(station)', at })
  assert.match(src('app/api/admin/broadcast/route.ts'), /collection\('hostActions'\)\.add\(broadcastAudit\(t\.uid, title, sent, Timestamp\.now\(\)\)\)/)
})
