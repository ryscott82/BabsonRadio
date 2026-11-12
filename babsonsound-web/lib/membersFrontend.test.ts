import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LEGACY_REDIRECTS, NAV_LINKS, activeHref, linksFor, profileMenu } from './siteNav.ts'
import { badgeRows, bannedNotice, canBook, nextUp, sectionsFor, signInPrompt, standingView, trainingDue, viewerOf } from './membersPage.ts'
import { QUIET_LINE, WALK_IN_NOTE, blockState, blocksOfDay, cancelInfo, holdState, lengthChips, longestFrom, pickLength, quietWarning, touchesQuiet } from './studioGrid.ts'
import { addChip, capacityLine, chipFromSuggestion, chipLabel, guestsProblem, isOutside, parseTyped, spotsLeft, toPayload } from './guestPicker.ts'
import { LIVE_LENGTHS, buildIcs, clampLength, clearDraft, levelAt, lengthsFor, loadDraft, moreLengths, nextOpen, popularLine, saveDraft, studioLine, usesStudio, weekNotice } from './hostFlow.ts'
import { actionLabel, copyText, eventProblem, manualAddProblem, standingFlag, strikeActions, type ListItem } from './strikesAdmin.ts'
import { KINDS, filterKinds, groupByDay, mergeOnAir } from './everythingOnAir.ts'
import { menuFor } from './adminMenu.ts'
import { guestCsv } from './studioList.ts'
import { nyToMs, nyWeekKey } from './slotAuto.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const MIN = 60_000, HOUR = 3_600_000

// ── navigation ──
test('the main bar is Live, Schedule, Library, Members, About', () => {
  assert.deepEqual(NAV_LINKS.map(l => l.label), ['Live', 'Schedule', 'Library', 'Members', 'About'])
  assert.ok(!NAV_LINKS.some(l => l.href === '/shows'))
})
test('guests only get Live and Members (events and info); hosting adds Host', () => {
  assert.deepEqual(linksFor({ isGuest: true, hosting: false }).map(l => l.label), ['Live', 'Members'])
  assert.equal(linksFor({ isGuest: false, hosting: true }).at(-1)?.label, 'Host')
  assert.equal(linksFor({ isGuest: false, hosting: false }).length, 5)
})
test('old addresses keep working: /shows goes to the Library, /browse too, show pages are untouched', () => {
  assert.deepEqual(LEGACY_REDIRECTS.find(r => r.source === '/shows'), { source: '/shows', destination: '/library#shows' })
  assert.equal(LEGACY_REDIRECTS.find(r => r.source === '/browse')?.destination, '/library')
  assert.ok(!LEGACY_REDIRECTS.some(r => r.source.includes('slug') || r.source === '/shows/:slug'))
  assert.match(src('next.config.ts'), /LEGACY_REDIRECTS/)
  assert.match(src('app/shows/page.tsx'), /redirect\('\/library#shows'\)/)
  assert.match(src('app/browse/page.tsx'), /redirect\('\/library'\)/)
  assert.equal(src('app/shows/[slug]/page.tsx').includes('export default'), true)
})
test('Library is lit on show pages; Members on its sub pages; guests may open Members', () => {
  assert.equal(activeHref('/shows/jazz-hour', '/library'), true)
  assert.equal(activeHref('/slots', '/members'), true)
  assert.equal(activeHref('/schedule', '/library'), false)
  assert.match(src('components/GuestFence.tsx'), /'\/members'\]/)
})
test('the Library page has a Shows and an Episodes section and a Host a show card at the bottom', () => {
  const p = src('app/library/page.tsx')
  assert.match(p, /id="shows"/); assert.match(p, /id="episodes"/)
  assert.ok(p.indexOf('id="episodes"') < p.indexOf('<HostShowCard'))
})
test('Host a show is first in the profile menu for students, and absent for guests', () => {
  assert.equal(profileMenu({ isStudent: true, isGuest: false, staff: false })[0].label, 'Host a show')
  assert.ok(!profileMenu({ isStudent: false, isGuest: true, staff: false }).some(l => l.label === 'Host a show'))
  assert.ok(profileMenu({ isStudent: true, isGuest: false, staff: true }).some(l => l.label === 'Settings'))
  assert.doesNotMatch(src('components/Nav.tsx'), /Request a spot/)
})
test('Host a show appears on Schedule, Library, Members, after training, My shows and the booking screen', () => {
  assert.match(src('app/schedule/page.tsx'), /<HostShowCard compact/)
  assert.match(src('app/schedule/ScheduleList.tsx'), /Host here/)
  assert.match(src('app/members/page.tsx'), /<HostShowCard/)
  assert.match(src('app/training/page.tsx'), /You can now host/)
  assert.match(src('components/HostMyShows.tsx'), /Same time next week/)
  assert.match(src('components/HostMyShows.tsx'), /Pick another time/)
  assert.match(src('components/StudioBooking.tsx'), /Schedule this to air/)
})

// ── Members page by role ──
test('signed-out people and guests see only events and info, with a sign-in prompt', () => {
  assert.deepEqual(sectionsFor(viewerOf({ signedIn: false, isGuest: false, isBabson: false })), ['events', 'info'])
  assert.deepEqual(sectionsFor(viewerOf({ signedIn: true, isGuest: true, isBabson: false })), ['events', 'info'])
  assert.match(signInPrompt('signed-out'), /Sign in/)
  assert.match(signInPrompt('guest'), /Babson, Olin and Wellesley/)
  assert.equal(signInPrompt('student'), '')
})
test('students see the seven sections top to bottom', () => {
  assert.deepEqual(sectionsFor('student'), ['next', 'host', 'studio', 'standing', 'training', 'events', 'info'])
  const p = src('app/members/page.tsx')
  const order = ['id="next"', 'id="host"', 'id="studio"', 'id="standing"', 'id="training"', 'id="events"', 'id="info"'].map(k => p.indexOf(k))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.match(p, /show\.has\('studio'\)/)
  assert.doesNotMatch(p, /disabled/)
})
test('booking needs the Studio badge: without it there is a Get trained button, not an error', () => {
  assert.equal(canBook(false), false)
  assert.match(src('components/StudioBooking.tsx'), /Get trained/)
  assert.match(src('components/StudioBooking.tsx'), /href="#training"/)
})
test('Next up for me: my next booking, my next show, a training that is due', () => {
  const now = nyToMs(2026, 11, 12, 12, 0)
  const badges = badgeRows({ studioExpiresAt: now + 10 * 86_400_000, radioExpiresAt: now + 200 * 86_400_000 }, { studio: true, radio: true })
  const items = nextUp({ now, bookings: [{ startAt: now + 2 * HOUR, endAt: now + 3 * HOUR, status: 'booked' }, { startAt: now - 5 * HOUR, endAt: now - 4 * HOUR, status: 'booked' }], shows: [{ title: 'Late Night', startAt: now + 30 * HOUR, status: 'pending' }], badges })
  assert.deepEqual(items.map(i => i.kind), ['booking', 'show', 'training'])
  assert.match(items[1].text, /\(pending\)/)
  assert.match(items[2].text, /Studio training ends/)
  assert.equal(trainingDue(badgeRows({}, { studio: true, radio: true }), now), '')
  assert.match(trainingDue(badgeRows({ radioExpired: true }, { studio: false, radio: false }), now), /Radio training has ended/)
})

// ── studio booking ──
test('blocks run 30 minutes from 7 AM to 11 PM: 32 blocks, even on the days the clocks change', () => {
  for (const d of [nyToMs(2026, 11, 12, 0, 0), nyToMs(2026, 11, 1, 0, 0), nyToMs(2026, 3, 8, 0, 0)]) {
    const b = blocksOfDay(d, 7, 23)
    assert.equal(b.length, 32)
    assert.equal(b[1] - b[0], 30 * MIN)
  }
})
test('a taken block is taken, a passed block is passed, a free block is free', () => {
  const now = nyToMs(2026, 11, 12, 12, 0)
  const ranges = [{ startAt: now + HOUR, endAt: now + 2 * HOUR }]
  assert.equal(blockState(now - HOUR, { ranges, now, lookAheadDays: 30 }), 'past')
  assert.equal(blockState(now + HOUR, { ranges, now, lookAheadDays: 30 }), 'taken')
  assert.equal(blockState(now + 3 * HOUR, { ranges, now, lookAheadDays: 30 }), 'free')
  assert.equal(blockState(now + 40 * 86_400_000, { ranges, now, lookAheadDays: 30 }), 'far')
})
test('length chips are 30, 60, 90 and shrink when the next booking is close', () => {
  const start = nyToMs(2026, 11, 13, 10, 0)
  const closeMs = nyToMs(2026, 11, 13, 23, 0)
  assert.deepEqual(lengthChips(longestFrom(start, { ranges: [], closeMs, maxMinutes: 90 }), 30, 90), [30, 60, 90])
  const near = [{ startAt: start + 60 * MIN, endAt: start + 120 * MIN }]
  assert.equal(longestFrom(start, { ranges: near, closeMs, maxMinutes: 90 }), 60)
  assert.deepEqual(lengthChips(60, 30, 90), [30, 60])
  assert.equal(longestFrom(nyToMs(2026, 11, 13, 22, 30), { ranges: [], closeMs, maxMinutes: 90 }), 30)
  assert.equal(pickLength(90, [30, 60]), 60)
  assert.equal(pickLength(30, [30, 60]), 30)
})
test('the 2-booking limit is shown as a state, and cancelling is free until 2 hours before', () => {
  assert.equal(holdState(2, 2).full, true)
  assert.match(holdState(2, 2).line, /2 of 2 bookings/)
  assert.equal(holdState(1, 2).full, false)
  const now = nyToMs(2026, 11, 12, 12, 0)
  assert.match(cancelInfo(now + 5 * HOUR, now, 2).line, /until 2 hours before/)
  assert.match(cancelInfo(now + 1 * HOUR, now, 2).line, /Less than 2 hours/)
  assert.equal(cancelInfo(now + 1 * HOUR, now, 2).canCancel, true)
  assert.equal(cancelInfo(now - HOUR, now, 2).canCancel, false)
  assert.match(src('components/StudioBooking.tsx'), /hold\.full/)
})
test('the walk-in note is on the booking screen, word for word', () => {
  assert.equal(WALK_IN_NOTE, 'You do not need a booking to use the studio when it is free. A booking just reserves it.')
  assert.match(src('components/StudioBooking.tsx'), /\{WALK_IN_NOTE\}/)
})
test('quiet hours shade the grid and warn in one line, and never block', () => {
  const quiet = [{ startAt: 1000 * MIN, endAt: 1060 * MIN }]
  assert.equal(touchesQuiet(quiet, 1050 * MIN, 1080 * MIN), true)
  assert.equal(quietWarning(quiet, 1050 * MIN, 1080 * MIN), 'Quiet hours: no loud DJ sets, keep the volume as low as possible')
  assert.equal(quietWarning(quiet, 1100 * MIN, 1130 * MIN), '')
  assert.equal(QUIET_LINE, quietWarning(quiet, 1000 * MIN, 1030 * MIN))
  const g = src('components/TimeGrid.tsx')
  assert.match(g, /c\.quiet \? 'bg-sky-500\/10'/)
  assert.doesNotMatch(g, /disabled=\{[^}]*quiet/)
  assert.match(src('components/HostShow.tsx'), /quiet &&/)
})

// ── guests ──
test('typed names and emails make chips; a name alone is asked for an email', () => {
  const a = parseTyped('Sam Lee sam@babson.edu'); assert.ok(a.ok && a.chip.name === 'Sam Lee' && a.chip.email === 'sam@babson.edu' && !a.chip.outside)
  const b = parseTyped('Sam Lee <sam@gmail.com>'); assert.ok(b.ok && b.chip.outside)
  const c = parseTyped('jo.park@olin.edu'); assert.ok(c.ok && c.chip.name === 'Jo Park')
  assert.equal(parseTyped('Sam Lee').ok, false)
  assert.equal(parseTyped('x@y').ok, false)
  assert.equal(isOutside('a@wellesley.edu'), false)
  assert.equal(isOutside('a@example.com'), true)
})
test('guest chips never show a full email: masked only, outside emails marked', () => {
  const s = chipFromSuggestion({ id: 'u:abc', name: 'Riley Park', emailMasked: 'r***@b***.edu', kind: 'member' })
  assert.equal(chipLabel(s), 'r***@b***.edu')
  const t = parseTyped('Sam Lee sam@gmail.com'); assert.ok(t.ok)
  if (t.ok) { assert.doesNotMatch(chipLabel(t.chip), /sam@gmail\.com/); assert.match(chipLabel(t.chip), /outside email/) }
  const pick = src('components/GuestPicker.tsx')
  assert.doesNotMatch(pick, /\{[a-z]+\.email\}/)
  assert.match(pick, /emailMasked/); assert.match(pick, /chipLabel/)
})
test('guests are needed unless Just me; capacity counts the booker; suggestions send only an id', () => {
  assert.match(guestsProblem([], false), /Just me/)
  assert.equal(guestsProblem([], true), '')
  let chips = [] as ReturnType<typeof chipFromSuggestion>[]
  const cap = 3
  for (const n of ['a', 'b']) { const r = addChip(chips, chipFromSuggestion({ id: `u:${n}`, name: n, emailMasked: 'x***@y***.edu', kind: 'member' }), cap); assert.ok(r.ok); if (r.ok) chips = r.chips }
  assert.equal(spotsLeft(chips, cap), 0)
  assert.match(capacityLine(chips, cap), /full/)
  assert.equal(addChip(chips, chipFromSuggestion({ id: 'u:c', name: 'c', emailMasked: 'c***@y***.edu', kind: 'past' }), cap).ok, false)
  assert.deepEqual(toPayload(chips)[0], { id: 'u:a', name: 'a', email: '' })
  assert.match(capacityLine([], 12), /11 more people fit/)
})
test('the guest box asks the server a moment after typing, with keyboard support, and does not poll', () => {
  const pick = src('components/GuestPicker.tsx')
  assert.match(pick, /setTimeout\(/); assert.doesNotMatch(pick, /setInterval/)
  assert.match(pick, /ArrowDown/); assert.match(pick, /role="combobox"/)
  assert.match(pick, /\/api\/people\/suggest/)
  assert.match(src('components/HostShow.tsx'), /<GuestPicker/)
  assert.match(src('components/StudioBooking.tsx'), /<GuestPicker/)
})

// ── Host a show ──
test('live shows are at most 90 minutes; pre-recorded keeps its own lengths', () => {
  assert.deepEqual(lengthsFor('live'), [30, 60, 90])
  assert.ok(lengthsFor('prerecorded').includes(120))
  assert.ok(!moreLengths('live').some(m => m > 90))
  assert.ok(moreLengths('prerecorded').includes(240))
  assert.equal(clampLength('live', 120), 90)
  assert.equal(clampLength('prerecorded', 120), 120)
  assert.deepEqual([...LIVE_LENGTHS], [30, 60, 90])
})
test('a live show says it uses the studio, with a tick "I am not using the studio" under More options', () => {
  assert.equal(usesStudio('live', false), true); assert.equal(usesStudio('live', true), false); assert.equal(usesStudio('prerecorded', false), false)
  assert.match(studioLine('live', false), /Uses the studio/)
  assert.equal(studioLine('prerecorded', false), '')
  const h = src('components/HostShow.tsx')
  assert.ok(h.indexOf('More options') < h.indexOf('I am not using the studio'))
})
test('popular times: three shading levels, a line for the category, never blocking', () => {
  const grid = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 20 ? 3 : d === 2 && h === 19 ? 2 : d === 2 && h === 18 ? 1 : 0)))
  const tue = nyToMs(2026, 11, 10, 20, 30)
  assert.equal(levelAt(grid, tue), 3)
  assert.equal(levelAt(grid, tue - HOUR), 2)
  assert.equal(levelAt(grid, tue - 2 * HOUR), 1)
  assert.equal(levelAt(grid, tue + 5 * HOUR), 0)
  assert.equal(levelAt(null, tue), 0)
  assert.equal(popularLine('podcast', [{ label: 'Tue 8-10 pm' }], false), 'Popular for Podcast shows: Tue 8-10 pm')
  assert.match(popularLine('podcast', [{ label: 'Tue 8-10 pm' }], true), /Popular on the station/)
  assert.equal(popularLine('music', [], false), '')
  assert.doesNotMatch(src('components/TimeGrid.tsx'), /disabled=\{[^}]*level/)
  assert.match(src('components/HostShow.tsx'), /\/api\/slots\/popular/)
})
test('the weekly notice says automatic approval or staff approval', () => {
  const t = nyToMs(2026, 11, 17, 20, 0)
  assert.match(weekNotice(t, { [nyWeekKey(t)]: true }, { autoApproveHours: 24 }).line, /staff approval, because you already have a show that week/)
  assert.equal(weekNotice(t, {}, { autoApproveHours: 24 }).line, 'Approved automatically 24 hours after you send it.')
})
test('next open times respect the lead time and skip booked times', () => {
  const now = nyToMs(2026, 11, 12, 9, 0)
  const open = nextOpen([{ startAt: nyToMs(2026, 11, 13, 21, 0), endAt: nyToMs(2026, 11, 13, 23, 0) }], now, 36, 60)
  assert.ok(open.length > 0 && open.every(s => s >= now + 36 * HOUR))
  assert.ok(open.every(s => !(s >= nyToMs(2026, 11, 13, 20, 30) && s < nyToMs(2026, 11, 13, 23, 0))))
})
test('the calendar file is a valid one-event .ics and the draft survives blocked storage', () => {
  const ics = buildIcs({ title: 'Late; Night, Show', startAt: Date.UTC(2026, 10, 14, 1, 0), endAt: Date.UTC(2026, 10, 14, 2, 0) })
  assert.match(ics, /^BEGIN:VCALENDAR/); assert.match(ics, /DTSTART:20261114T010000Z/); assert.match(ics, /SUMMARY:Late\\; Night\\, Show/); assert.match(ics, /END:VCALENDAR$/)
  const blocked = { setItem() { throw new Error('blocked') }, getItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.doesNotThrow(() => saveDraft({ title: 'x' }, blocked)); assert.deepEqual(loadDraft(blocked), {}); assert.doesNotThrow(() => clearDraft(blocked))
  const mem = new Map<string, string>(); const store = { setItem: (k: string, v: string) => void mem.set(k, v), getItem: (k: string) => mem.get(k) ?? null, removeItem: (k: string) => void mem.delete(k) }
  saveDraft({ title: 'Hello', type: 'live' }, store); assert.equal(loadDraft(store).title, 'Hello')
})
test('the Host a show page has three steps, the policy box and guests, and does not poll', () => {
  const h = src('components/HostShow.tsx')
  assert.match(h, /'Pick a time', 'Your show', 'Send'/)
  assert.match(h, /<PolicyBox/); assert.match(h, /policyAck: true/); assert.match(h, /guests: toPayload/)
  assert.match(h, /Request this time/); assert.match(h, /Add to calendar/)
  assert.doesNotMatch(h, /setInterval/)
})

// ── standing and policy ──
test('standing reads in plain words', () => {
  assert.equal(standingView({ level: 0, label: 'Good standing', bannedUntil: null, strikes: [] }).headline, 'Good standing')
  const one = standingView({ level: 1, label: '1 mistake', bannedUntil: null, strikes: [{ date: 'Nov 3, 2026', reason: 'Missed a live show' }] })
  assert.equal(one.headline, '1 mistake'); assert.deepEqual(one.lines, ['Nov 3, 2026: Missed a live show'])
  assert.equal(standingView({ level: 2, label: 'Warning', bannedUntil: null, strikes: [] }).headline, 'Warning')
})
test('a banned person sees why and until when instead of the forms', () => {
  const until = nyToMs(2026, 12, 18, 12, 0)
  const s = { level: 3, label: 'Banned until Dec 18, 2026', bannedUntil: until, strikes: [{ date: 'Nov 3, 2026', reason: 'Missed a live show' }, { date: 'Nov 9, 2026', reason: 'Cancelled a show late' }] }
  const text = bannedNotice(s)
  assert.match(text, /until Dec 18, 2026/); assert.match(text, /missed a live show/i); assert.match(text, /cancelled a show late/i)
  assert.equal(bannedNotice({ ...s, level: 2 }), '')
  assert.equal(standingView(s).banned, true)
  assert.match(src('components/HostShow.tsx'), /banned \? \(/)
  assert.match(src('components/StudioBooking.tsx'), /banned \? \(/)
})
test('the policy box has the agreed wording', () => {
  const p = src('lib/hostFlow.ts')
  assert.match(p, /missed show or booking gets a mistake, then a warning, then a ban from hosting and booking for the rest of the semester/)
  assert.match(p, /E-board can excuse a mistake/)
})

// ── E-board lists ──
test('the standing flag on Users and request rows', () => {
  assert.equal(standingFlag(0), ''); assert.equal(standingFlag(1), '1 mistake'); assert.equal(standingFlag(2), 'Warning'); assert.equal(standingFlag(3), 'Banned')
  assert.equal(standingFlag(0, Date.now() + 100_000), 'Banned')
  assert.match(src('app/admin/users/page.tsx'), /standingFlag\(/); assert.match(src('components/admin/today/NeedsApproval.tsx'), /standingFlag\(/)
  assert.match(src('app/api/admin/users/route.ts'), /strikeLevel/)
})
test('strikes: confirm or excuse a pending flag, take back a confirmed one, a manual add needs a member and a note', () => {
  assert.deepEqual(strikeActions('pending'), ['confirm', 'excuse']); assert.deepEqual(strikeActions('confirmed'), ['excuse']); assert.deepEqual(strikeActions('excused'), [])
  assert.equal(actionLabel('confirmed', 'excuse'), 'Take back'); assert.equal(actionLabel('pending', 'excuse'), 'Excuse')
  assert.match(manualAddProblem('', 'x'), /Pick a member/); assert.match(manualAddProblem('u:abc', ' '), /note/); assert.equal(manualAddProblem('u:abc', 'late'), '')
  assert.match(src('app/admin/notifications/page.tsx'), /<StrikesPanel pendingOnly/)
})
test('the Shows tab has Strikes, Studio list and Club events for E-board and Admin', () => {
  for (const role of ['director', 'admin'] as const) {
    const titles = menuFor(role).find(t => t.id === 'shows')!.tiles.map(t => t.title)
    for (const t of ['Strikes', 'Studio list', 'Club events']) assert.ok(titles.includes(t), `${role} ${t}`)
  }
  for (const p of ['strikes', 'studio-list', 'club-events']) assert.match(src(`app/admin/${p}/page.tsx`), /isDirector/)
})
test('the studio list shows names and emails to the E-board, copies them and exports CSV, with no polling', () => {
  const rows: ListItem[] = [{ kind: 'studio', startAt: Date.UTC(2026, 10, 14, 18), endAt: Date.UTC(2026, 10, 14, 19), hostName: 'Ann Host', hostEmail: 'ann@babson.edu', title: 'Studio booking', status: 'booked', guests: [{ name: 'Sam', email: 'sam@x.com' }], justMe: false }]
  assert.match(copyText(rows), /Sam <sam@x\.com>/)
  assert.match(guestCsv(rows), /"Sam","sam@x\.com"/)
  const page = src('app/admin/studio-list/page.tsx')
  assert.match(page, /Copy/); assert.match(page, /Download CSV/); assert.doesNotMatch(page, /setInterval/)
})
test('club events: a title and an end after the start; add, edit and delete', () => {
  assert.match(eventProblem({ title: '', startAt: 1, endAt: 2, place: '', details: '' }), /title/)
  assert.match(eventProblem({ title: 'x', startAt: 5, endAt: 2, place: '', details: '' }), /end must be after/)
  assert.equal(eventProblem({ title: 'x', startAt: 1, endAt: 2, place: '', details: '' }), '')
  assert.match(src('app/admin/club-events/page.tsx'), /apiDelete/)
})
test('Everything on air merges weekly shows, events, approved shows, pending requests and Auto DJ, pending labeled', () => {
  const now = 1_000_000
  const f = (id: string, source: 'weekly' | 'event' | 'slot' | 'auto', title: string, s: number, e: number) => ({ id, source, title, hosts: source === 'slot' ? ['Ann'] : [], startAt: s, endAt: e, format: 'show' })
  const feed = [f('w', 'weekly', 'Weekly', now + 4 * HOUR, now + 5 * HOUR), f('e', 'event', 'Event', now + 6 * HOUR, now + 7 * HOUR), f('s', 'slot', 'Student', now + 2 * HOUR, now + 3 * HOUR),
    f('a', 'auto', 'Jazz block', now + HOUR, now + 2 * HOUR), f('old', 'weekly', 'Old', now - 5 * HOUR, now - 4 * HOUR)]
  const rows = mergeOnAir(feed, [{ id: 'p', title: 'Requested', requesterName: 'Bo', startAt: now + 3 * HOUR + 1, durationMin: 60, held: true }], now)
  assert.deepEqual(rows.map(r => r.kind), ['auto', 'approved', 'pending', 'weekly', 'event'])
  assert.equal(rows.find(r => r.kind === 'pending')?.note, 'on hold')
  assert.deepEqual(KINDS, ['weekly', 'event', 'approved', 'pending', 'auto'])
  assert.equal(filterKinds(rows, new Set(['pending'] as const)).length, 1)
  assert.ok(groupByDay(rows).length >= 1)
  assert.match(src('app/admin/schedule/page.tsx'), /Everything on air/)
})
test('settings: studio capacity is a main setting, the other studio and strike settings are Expert', () => {
  const s = src('lib/adminSettings.ts')
  assert.match(s, /'studio\.capacity'/)
  for (const k of ['studio.openHour', 'studio.quiet', 'strikes.semesterEnd', 'strikes.studioNoShow']) assert.match(s, new RegExp(`key: '${k.replace('.', '\\.')}'[^\\n]*level: 3`))
})

// ── every new screen: 16 px text, no polling ──
test('new screens use text of 16 px or larger and no polling', () => {
  const files = ['components/TimeGrid.tsx', 'components/GuestPicker.tsx', 'components/StudioBooking.tsx', 'components/HostShow.tsx', 'components/HostMyShows.tsx', 'components/HostShowCard.tsx',
    'components/PolicyBox.tsx', 'components/ShowsGrid.tsx', 'components/members/TrainingCard.tsx', 'components/members/ClubEvents.tsx', 'components/members/InfoCard.tsx',
    'components/members/StandingCard.tsx', 'app/members/page.tsx', 'app/library/page.tsx', 'components/admin/strikes/StrikesPanel.tsx', 'components/admin/EverythingOnAir.tsx',
    'app/admin/strikes/page.tsx', 'app/admin/studio-list/page.tsx', 'app/admin/club-events/page.tsx']
  for (const f of files) {
    const t = src(f)
    assert.doesNotMatch(t, /text-(sm|xs)\b/, `${f} has small text`)
    assert.doesNotMatch(t, /setInterval/, `${f} polls`)
  }
})
