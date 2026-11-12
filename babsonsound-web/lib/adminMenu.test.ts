import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { EXTRA_PAGES, LEGACY_HASH, SECTIONS, backTarget, eboardExtras, fromNote, menuFor, readFromNote, resolveHash, searchMenu, tabHref, tabOfPath } from './adminMenu.ts'
import { oldSettingsTarget, settingHref, settingPage } from './settingsHome.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const titles = (role: 'director' | 'admin') => menuFor(role).map(s => s.title)
const hrefs = (role: 'director' | 'admin') => menuFor(role).flatMap(s => s.tiles.map(t => t.href))
const tabOf = (h: string) => SECTIONS.find(s => s.tiles.some(t => t.href === h))?.id

// ── tabs per role ──
test('E-board sees Settings, Users, Shows, Content and Notifications, in that order, and no Advanced', () => {
  assert.deepEqual(titles('director'), ['Settings', 'Users', 'Shows', 'Content', 'Notifications'])
})
test('an admin sees the same five and Advanced last', () => {
  assert.deepEqual(titles('admin'), ['Settings', 'Users', 'Shows', 'Content', 'Notifications', 'Advanced'])
})
test('nothing Admin-only is in the E-board menu, not even a heading, and no tab is empty', () => {
  const adminOnly = SECTIONS.filter(s => !s.admin).flatMap(s => s.tiles).filter(t => t.admin).map(t => t.href)
  assert.ok(adminOnly.length >= 8)
  for (const h of hrefs('director')) assert.ok(!adminOnly.includes(h), h)
  for (const s of menuFor('director').slice(1)) assert.ok(s.href || s.tiles.length > 0, s.id)
  for (const h of ['/admin/server-load', '/admin/listening-limits', '/admin/expert', '/admin/site-text', '/admin/users', '/admin/launch-email', '/admin/feedback', '/admin/tests', '/admin/docs']) assert.ok(!hrefs('director').includes(h), h)
  assert.ok(!menuFor('director').some(s => s.id === 'advanced'))
})
test('tab membership matches the design', () => {
  const admin = (id: string) => menuFor('admin').find(s => s.id === id)!
  assert.deepEqual(admin('users').tiles.map(t => t.title), ['Users and roles', 'Training', 'Phone changes', 'Phone lookup', 'Birthdays', 'Studio PC log'])
  assert.deepEqual(admin('shows').tiles.map(t => t.title), ['Schedule', 'Show requests', 'Show changes', 'Auto DJ', 'Set lists'])
  assert.deepEqual(admin('content').groups[0].tiles.map(t => t.title), ['Episodes', 'Music library', 'Uploads', 'Song requests', 'Blocked words'])
  assert.equal(admin('content').groups[1].title, 'Content library')
  assert.deepEqual(admin('advanced').groups.map(g => g.title), ['Server', 'Limits and defaults', 'Site and content settings', 'Tools'])
  assert.deepEqual(admin('advanced').tiles.map(t => t.title).sort(),
    ['Bugs and ideas', 'Docs', 'Easter eggs', 'Expert settings', 'Launch email', 'Listening limits', 'Page text', 'Server load', 'Stats', 'Studio form', 'Tests'].sort())
})
test('E-board Users tab has Training and the Studio PC log; Shows has Auto DJ; Content has Blocked words and no library settings', () => {
  const t = (id: string) => menuFor('director').find(s => s.id === id)!.tiles.map(x => x.href)
  assert.deepEqual(t('users'), ['/admin/training', '/admin/booth'])
  assert.ok(t('shows').includes('/admin/autoschedule'))
  assert.ok(t('content').includes('/admin/blocked-words'))
  assert.equal(menuFor('director').find(s => s.id === 'content')!.groups.length, 1)
})
test('Bugs and ideas is in Advanced and its badge is on the Advanced tab, so only Admins ever see it; Blocked words is in Content', () => {
  assert.equal(tabOf('/admin/feedback'), 'advanced')
  assert.equal(tabOf('/admin/blocked-words'), 'content')
  assert.equal(SECTIONS.flatMap(s => s.tiles).find(t => t.href === '/admin/feedback')?.badge, 'reports')
  assert.equal(SECTIONS.find(s => s.id === 'advanced')!.admin, true)
  const page = src('app/admin/page.tsx')
  assert.match(page, /g\.tiles\.reduce\(\(a, t\) => a \+ badgeOf\(t\.badge\)/) // the tab number is the sum of its tiles' badges
  assert.match(page, /newReports/)
})
test('Notifications is a tab that is itself a page, with the unread badge from the alerts read the page already makes', () => {
  const n = SECTIONS.find(s => s.id === 'notifications')!
  assert.equal(n.href, '/admin/notifications'); assert.equal(n.badge, 'alerts')
  for (const role of ['director', 'admin'] as const) assert.ok(menuFor(role).some(s => s.id === 'notifications'), role)
  const page = src('app/admin/page.tsx')
  assert.match(page, /unreadCount\(a\.items\)/)
  assert.match(page, /ALERTS_URL/)
  assert.match(page, /if \(!user \|\| !isDirector\) return\n\s+apiGet<\{ items: unknown\[\]; newReports/) // both roles read it, once
})
test('E-board keeps what they could open before: Stats is reachable from search and the More links, and so are the old pages', () => {
  assert.deepEqual(eboardExtras().map(e => e.href), ['/admin/stats'])
  assert.ok(searchMenu('director', 'stats').some(e => e.href === '/admin/stats'))
  for (const h of ['/admin/schedule', '/admin/slots', '/admin/show-updates', '/admin/autoschedule', '/admin/booth', '/admin/library', '/admin/requests', '/admin/training', '/admin/blocked-words']) assert.ok(hrefs('director').includes(h), h)
})

// ── old addresses ──
test('every old URL still opens: in the menu exactly once, or a redirect page that exists', () => {
  const old = ['schedule', 'slots', 'show-updates', 'booth', 'setlists', 'library', 'music-library', 'media', 'autoschedule', 'requests', 'blocked-words',
    'users', 'training', 'studio-form', 'phone-changes', 'phone-lookup', 'birthdays', 'launch-email', 'feedback', 'site-text',
    'listening-limits', 'easter-eggs', 'stats', 'server-load', 'tests', 'docs'].map(p => `/admin/${p}`)
  const all = hrefs('admin')
  for (const h of old) assert.equal(all.filter(x => x === h).length, 1, h)
  assert.ok(all.includes('/admin/expert'))
  for (const h of ['/admin/notify', '/admin/settings', '/admin/controls', '/admin/notifications']) assert.ok(existsSync(new URL(`../app${h}/page.tsx`, import.meta.url)), h)
})
test('/admin/notify redirects to /admin/notifications; the old settings address goes to Advanced', () => {
  assert.match(src('app/admin/notify/page.tsx'), /redirect\('\/admin\/notifications'\)/)
  assert.equal(oldSettingsTarget(null), '/admin#advanced')
  assert.equal(oldSettingsTarget('slots.weekLimit'), '/admin/slots?focus=slots.weekLimit')
})
test('old # links land on the right tab: #people, #music, #system, #customize, #settings, #onair, #messages, and the new names', () => {
  assert.equal(resolveHash('#people'), 'users'); assert.equal(resolveHash('#music'), 'content'); assert.equal(resolveHash('#system'), 'advanced')
  assert.equal(resolveHash('#customize'), 'advanced'); assert.equal(resolveHash('#settings'), 'advanced'); assert.equal(resolveHash('#onair'), 'shows')
  assert.equal(resolveHash('#messages'), 'notifications'); assert.equal(resolveHash('#rules'), 'advanced'); assert.equal(resolveHash('#tools'), 'advanced')
  for (const id of ['users', 'shows', 'content', 'notifications', 'advanced']) assert.equal(resolveHash(`#${id}`), id)
  assert.equal(resolveHash(''), 'home'); assert.equal(resolveHash('#nonsense'), 'home')
  for (const target of Object.values(LEGACY_HASH)) assert.ok(SECTIONS.some(s => s.id === target), target)
})
test('an old Advanced link opened by E-board lands on home, not on a tab they cannot see', () => {
  assert.equal(resolveHash('#system', 'director'), 'home'); assert.equal(resolveHash('#customize', 'director'), 'home'); assert.equal(resolveHash('#advanced', 'director'), 'home')
  assert.equal(resolveHash('#people', 'director'), 'users')
})

// ── Back ──
test('switching a tab pushes a history entry, and Back / the address bring the tab back', () => {
  const page = src('app/admin/page.tsx')
  assert.match(page, /history\.pushState\(null, '', tabHref\(id\)\)/)
  assert.match(page, /addEventListener\('popstate', sync\)/)
  assert.equal(tabHref('home'), '/admin'); assert.equal(tabHref('users'), '/admin#users'); assert.equal(tabHref('notifications'), '/admin/notifications')
})
test('every page in the menu has a Back target: the tab it belongs to, never plain home', () => {
  for (const s of SECTIONS) for (const t of s.tiles) {
    const path = t.href.split('?')[0]
    // A tile that points into another page (the library settings are rows of Expert settings) says where it came from.
    const to = t.href.includes('?') ? backTarget(path, 'admin', { tab: s.id, href: path }) : backTarget(path, 'admin')
    assert.equal(to.href, tabHref(s.id), path)
    assert.equal(to.label, s.title, path)
    assert.notEqual(to.href, '/admin', path)
  }
})
test('Back targets of the pages outside the tiles, and the Content library pages', () => {
  assert.equal(backTarget('/admin/usage', 'admin').href, '/admin#advanced')
  assert.equal(backTarget('/admin/playlog', 'admin').href, '/admin#advanced')
  assert.equal(backTarget('/admin/insights', 'admin').href, '/admin#advanced')
  assert.equal(backTarget('/admin/music-library/review', 'admin').href, '/admin#content') // the library's own pages are Content tiles too
  assert.equal(backTarget('/admin/music-library/activity', 'admin').label, 'Content')
  assert.equal(backTarget('/admin/notifications', 'director').href, '/admin')
  assert.equal(tabOfPath('/admin/music-library'), 'content'); assert.equal(tabOfPath('/admin/music-library/review'), 'content')
  for (const e of EXTRA_PAGES) assert.equal(tabOfPath(e.href), e.tab, e.href)
})
test('E-board on a page that sits in Advanced (Stats) goes back to home, not to a hidden tab', () => {
  assert.equal(backTarget('/admin/stats', 'director').href, '/admin')
  assert.equal(backTarget('/admin/insights', 'director').href, '/admin')
  assert.equal(backTarget('/admin/stats', 'admin').href, '/admin#advanced')
})
test('arrived from search: Back goes to the tab the person was on, only for that page', () => {
  const from = readFromNote(fromNote('shows', '/admin/users'))
  assert.deepEqual(from, { tab: 'shows', href: '/admin/users' })
  assert.equal(backTarget('/admin/users', 'admin', from).href, '/admin#shows')
  assert.equal(backTarget('/admin/training', 'admin', from).href, '/admin#users') // a different page ignores the note
  assert.equal(backTarget('/admin/users', 'director', readFromNote(fromNote('advanced', '/admin/users'))).href, '/admin') // hidden tab → home
  assert.equal(backTarget('/admin/slots', 'admin', readFromNote(fromNote('home', '/admin/slots'))).href, '/admin')
  assert.equal(readFromNote('not json'), null); assert.equal(readFromNote(null), null); assert.equal(readFromNote('{"tab":"zzz","href":"/x"}'), null)
})
test('the hub notes the tab the person was on whenever a page is opened (tile or search result); the Back bar reads it', () => {
  const page = src('app/admin/page.tsx'), bar = src('components/admin/BackBar.tsx')
  assert.match(page, /onClick=\{\(\) => remember\(t\.href\)\}/); assert.match(page, /setItem\(FROM_KEY, fromNote\(tab, href\)\)/)
  assert.match(bar, /backTarget\(path, isAdmin \? 'admin' : 'director', from\)/)
})

// ── search ──
test('search covers every page a role may open, including pages that are not tiles', () => {
  const adminHits = (q: string) => searchMenu('admin', q).map(e => e.href)
  for (const s of SECTIONS) for (const t of s.tiles) assert.ok(searchMenu('admin', t.title).some(e => e.href === t.href), t.href)
  assert.ok(adminHits('listening hours').includes('/admin/usage')); assert.ok(adminHits('friends').includes('/admin/network'))
  assert.ok(adminHits('notifications').includes('/admin/notifications')); assert.ok(searchMenu('director', 'notifications').some(e => e.href === '/admin/notifications'))
  assert.ok(searchMenu('director', 'what listeners like').some(e => e.href === '/admin/insights'))
  assert.equal(searchMenu('director', 'friends').length, 0)
  assert.equal(searchMenu('director', 'server load').length, 0)
  assert.deepEqual(searchMenu('admin', 'listening still').map(e => e.href), ['/admin/listening-limits'])
  assert.deepEqual(searchMenu('admin', '   '), [])
})
test('search also finds settings for admins, and never for E-board', () => {
  const extra = [{ href: '/admin/server-load?focus=cpu.budgetHours', title: 'Monthly server time allowance', text: 'Vercel hours', where: 'Settings · Server time', keywords: 'zzbudget' }]
  const hit = searchMenu('admin', 'zzbudget', extra)
  assert.equal(hit.length, 1); assert.equal(hit[0].setting, true)
  assert.equal(searchMenu('director', 'zzbudget', extra).length, 0)
})
test('a setting opens the page it lives on with the row highlighted', () => {
  assert.equal(settingPage('limits.student.idleMin'), '/admin/listening-limits')
  assert.equal(settingPage('cpu.protection'), '/admin/server-load')
  assert.equal(settingPage('auto.horizonHours'), '/admin/expert')
  assert.equal(settingHref('cpu.budgetHours'), '/admin/server-load?focus=cpu.budgetHours')
})
test('badges: Show requests carries the pending count; no tile is named Director or Admin Panel', () => {
  assert.equal(SECTIONS.flatMap(s => s.tiles).find(t => t.href === '/admin/slots')?.badge, 'pending')
  const all = SECTIONS.flatMap(s => [s.title, ...s.tiles.flatMap(t => [t.title, t.text])]).join(' ')
  assert.ok(!/\bDirectors?\b/.test(all)); assert.ok(!/Admin Panel/.test(all))
})

// ── full width ──
test('no admin page keeps a narrow centered column', () => {
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap(n => {
    const rel = `${dir}/${n}`
    return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory() ? walk(rel) : rel.endsWith('.tsx') ? [rel] : []
  })
  for (const f of [...walk('app/admin'), 'components/admin/UsageBanner.tsx', 'components/admin/BackBar.tsx']) assert.doesNotMatch(src(f), /max-w-(\[\d+px\]|\dxl|xl) mx-auto/, f)
})
