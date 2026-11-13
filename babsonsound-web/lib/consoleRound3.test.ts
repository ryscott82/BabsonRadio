import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONTROL_BUTTONS, MORE_SWITCHES, buttonsFor } from './controlButtons.ts'
import { BROADCAST_GAP_MS, broadcastAudit, broadcastWait } from './broadcastGuard.ts'
import { ALL_CLEAR, canSend, clip, confirmBody, goesTo, unreadCount } from './notificationsPage.ts'
import { studentShows } from './todayPage.ts'
import { shapeUpcoming, upcomingItems, UPCOMING_MAX, UPCOMING_MIN } from './todayData.ts'
import { shapeProfile, trainingOf } from './userProfile.ts'
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
test('the Overview is four boxes (Controls, Coming up, Needs approval, Report a bug) in a 2 by 2 grid; on phones Needs approval comes right after Controls', () => {
  const page = src('app/admin/page.tsx'), na = src('components/admin/today/NeedsApproval.tsx')
  assert.match(page, /lg:grid-cols-2 lg:grid-rows-2/)
  for (const c of ['<Controls role={role} />', '<ComingUp', '<NeedsApproval', '<ReportBug />']) assert.ok(page.includes(c), c)
  assert.match(page, /lg:col-start-1 lg:row-start-1[\s\S]*<Controls/); assert.match(page, /lg:col-start-2 lg:row-start-1[\s\S]*<ComingUp/)
  assert.match(page, /lg:col-start-1 lg:row-start-2[\s\S]*<NeedsApproval/); assert.match(page, /lg:col-start-2 lg:row-start-2[\s\S]*<ReportBug/)
  assert.match(na, /lg:overflow-y-auto/) // scrolls inside its own box
  assert.ok(na.indexOf('Approve all</button>') < na.indexOf('<ul className="divide-y'), 'Approve all sits at the top, above the list')
  const iControls = page.indexOf('<Controls role={role} />'), iNeeds = page.indexOf('<NeedsApproval'), iComing = page.indexOf('<ComingUp'), iBug = page.indexOf('<ReportBug')
  assert.ok(iControls > 0 && iControls < iNeeds && iNeeds < iComing && iComing < iBug) // DOM order = phone order
})
test('Report a bug files a bug through the existing feedback route and shows the server sentence', () => {
  const r = src('components/admin/today/ReportBug.tsx')
  assert.match(r, /api\('\/api\/feedback', \{ type: 'bug', message: text\.trim\(\), platform: 'web'/)
  assert.match(r, /setErr\(x instanceof Error \? x\.message/)
  assert.equal((r.match(/api\(/g) ?? []).length, 1)
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
  const r = quickSave({ ...good, cpu: 'lots', gb: 'big' }, '2026-11-09')
  assert.equal(r.ok, false)
  assert.ok(r.errors.cpu); assert.ok(r.errors.gb)
  assert.equal(quickSave({ ...good, date: '2026-11-30' }, '2026-11-09').ok, false)
})
test('any combination of the four numbers saves, as long as there is at least one', () => {
  const only = (k: 'cpu' | 'edge' | 'invocations' | 'gb', v: string) => quickSave({ date: good.date, cpu: '', edge: '', invocations: '', gb: '', [k]: v }, '2026-11-09')
  for (const [k, v] of [['cpu', '1.5'], ['edge', '1.2M'], ['invocations', '40K'], ['gb', '3.2 GB']] as const) assert.equal(only(k, v).ok, true, k)
  const two = quickSave({ date: good.date, cpu: '', edge: '1.2M', invocations: '', gb: '800 MB' }, '2026-11-09')
  assert.ok(two.ok && two.body.activeCpuHours === null && two.body.edgeRequests === 1200000 && two.body.fastDataTransferGB === 0.8)
  const none = quickSave({ date: good.date, cpu: '', edge: '', invocations: '', gb: '' }, '2026-11-09')
  assert.equal(none.ok, false)
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

// ── Needs approval: buttons and the requester's profile ──
test('every request has Approve, a red Decline and Hold (Release hold when held), and says when it auto approves', () => {
  const na = src('components/admin/today/NeedsApproval.tsx')
  assert.match(na, />\{busy === r\.id \? 'Working…' : 'Approve'\}<\/button>/)
  assert.match(na, /className="ops-btn-red[^"]*"[^\n]*>Decline<\/button>/)
  assert.match(na, /\{holdLabel\(!!r\.held\)\}/); assert.match(na, /api\('\/api\/slots\/hold', holdBody\(r\.id, !r\.held\)\)/)
  assert.match(na, /waitingFor\(r, now\)/)
  assert.doesNotMatch(na, /whyWaiting/)
})
test('the requester name links to their profile, which E-board and Admin can open', () => {
  assert.match(src('components/admin/today/NeedsApproval.tsx'), /href=\{`\/admin\/users\/\$\{encodeURIComponent\(r\.hostUid\)\}`\}/)
  const page = src('app/admin/users/[uid]/page.tsx'), route = src('app/api/admin/users/profile/route.ts')
  assert.match(page, /isDirector/); assert.doesNotMatch(page, /isAdmin/)
  assert.match(route, /requireDirector\(req\)/); assert.doesNotMatch(route, /requireAdmin|requireStaff/)
  assert.match(page, /Show history/); assert.match(page, /Training/)
})
test('the profile shows training and show history, newest first, and never an email, phone or Instagram handle', () => {
  const NOW = 1_800_000_000_000
  const p = shapeProfile({ firstName: 'Sam', lastName: 'Lee', gradYear: '2027', level: 'student', radioTrained: true, radioExpiresAt: NOW + 1000, studioTrained: false, email: 'sam@babson.edu', phone: '123', instagram: '@sam' } as never,
    [{ id: 'a', title: 'Old', startAt: 1, type: 'live', status: 'approved' }, { id: 'b', title: 'New', startAt: 9, type: 'live', status: 'declined' }, { id: 'c', title: 'Next', startAt: 20, type: 'recorded', status: 'pending' }], NOW)
  assert.equal(p.name, 'Sam Lee'); assert.equal(p.radio.trained, true); assert.equal(p.studio.trained, false)
  assert.deepEqual(p.shows.map(s => s.id), ['c', 'b', 'a'])
  assert.deepEqual(p.counts, { total: 3, approved: 1, declined: 1, pending: 1 })
  const json = JSON.stringify(p)
  for (const w of ['sam@babson.edu', '123', '@sam', 'email', 'phone', 'instagram']) assert.ok(!json.includes(w), w)
  assert.deepEqual(trainingOf(true, NOW - 1, NOW), { trained: false, expired: true, until: NOW - 1 })
  assert.equal(shapeProfile({ level: 'director' }, [], NOW).radio.trained, true) // E-board and Admins always count as trained
})

test('Coming up shows at least the next 10 student shows however far away, never Auto DJ, and every one in the next 24 hours if there are more', () => {
  const NOW = 1_800_000_000_000, H = 3_600_000
  const item = (i: number, source = 'slot', at = NOW + i * 6 * H) => ({ id: `slot-${i}`, title: `Show ${i}`, startAt: at, endAt: at + H, source })
  const far = Array.from({ length: 25 }, (_, i) => item(i + 1))
  const auto = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, title: 'Auto', startAt: NOW + i * H, endAt: NOW + (i + 1) * H, source: 'auto' }))
  const rows = shapeUpcoming([...auto, ...far], new Map(), NOW)
  assert.equal(rows.length, UPCOMING_MIN); assert.ok(rows.every(r => r.source !== 'auto'))
  assert.deepEqual(rows.map(r => r.title)[0], 'Show 1'); assert.ok(rows[9].startAt > NOW + 24 * H) // reaches days ahead
  assert.equal(shapeUpcoming(far.slice(0, 4), new Map(), NOW).length, 4) // fewer than 10 exist: all of them
  const busy = Array.from({ length: 14 }, (_, i) => item(i, 'slot', NOW + (i + 1) * H))
  assert.equal(upcomingItems(busy, NOW).length, 14) // more than 10 in the next day: all of them
  assert.equal(upcomingItems(Array.from({ length: 60 }, (_, i) => item(i, 'slot', NOW + (i + 1) * 60_000)), NOW).length, UPCOMING_MAX)
  assert.equal(upcomingItems([item(1, 'slot', NOW - 5 * H)], NOW).length, 0) // already over
  const route = src('app/api/admin/dashboard/route.ts')
  assert.match(route, /includeAuto: false/); assert.match(route, /shapeUpcoming\(feed, hosts, now\)/)
})
