import test from 'node:test'
import assert from 'node:assert/strict'
import { SECTIONS, eboardExtras, menuFor, searchMenu, LEGACY_HASH } from './adminMenu.ts'
import { oldSettingsTarget, settingHref, settingPage } from './settingsHome.ts'

const titles = (role: 'director' | 'admin') => menuFor(role).map(s => s.title)
const hrefs = (role: 'director' | 'admin') => menuFor(role).flatMap(s => s.tiles.map(t => t.href))

test('E-board sees Today, Shows, Music and People only', () => {
  assert.deepEqual(titles('director'), ['Today', 'Shows', 'Music', 'People'])
})

test('an admin sees six headings: Today, Shows, Music, People, Customize and System', () => {
  assert.deepEqual(titles('admin'), ['Today', 'Shows', 'Music', 'People', 'Customize', 'System'])
})

test('there is no separate Settings heading and no All settings tile', () => {
  assert.ok(!SECTIONS.some(s => s.id === 'settings'))
  assert.ok(!hrefs('admin').includes('/admin/settings'))
})

test('E-board never gets an admin-only page in the menu, and no heading is left empty', () => {
  const adminOnly = SECTIONS.filter(s => !s.admin).flatMap(s => s.tiles).filter(t => t.admin).map(t => t.href)
  assert.ok(adminOnly.length >= 8)
  for (const h of hrefs('director')) assert.ok(!adminOnly.includes(h), h)
  for (const s of menuFor('director').slice(1)) assert.ok(s.tiles.length > 0, s.id)
  for (const h of ['/admin/server-load', '/admin/listening-limits', '/admin/expert', '/admin/notify', '/admin/site-text', '/admin/users']) assert.ok(!hrefs('director').includes(h), h)
})

test('pages moved per the design: Studio PC log under People, Stats under System, messages and Blocked words under Customize', () => {
  const where = (h: string) => SECTIONS.find(s => s.tiles.some(t => t.href === h))?.id
  assert.equal(where('/admin/booth'), 'people')
  assert.equal(where('/admin/stats'), 'system')
  for (const h of ['/admin/notify', '/admin/launch-email', '/admin/feedback', '/admin/blocked-words', '/admin/site-text', '/admin/easter-eggs']) assert.equal(where(h), 'customize', h)
  assert.equal(where('/admin/autoschedule'), 'shows')
})

test('E-board keeps what they could open: Stats and the add-only Blocked words are reachable from search and the More links, not the menu', () => {
  const extra = eboardExtras().map(e => e.href)
  assert.deepEqual(extra.sort(), ['/admin/blocked-words', '/admin/stats'])
  assert.ok(searchMenu('director', 'blocked words').some(e => e.href === '/admin/blocked-words'))
  assert.ok(searchMenu('director', 'stats').some(e => e.href === '/admin/stats'))
  assert.ok(!hrefs('director').includes('/admin/blocked-words') && !hrefs('director').includes('/admin/stats'))
})

test('E-board keeps the pages they could open before the redesign', () => {
  for (const h of ['/admin/schedule', '/admin/slots', '/admin/show-updates', '/admin/autoschedule', '/admin/booth', '/admin/library', '/admin/requests', '/admin/training']) {
    assert.ok(hrefs('director').includes(h), h)
  }
})

test('every URL from the old menu still opens: in the admin menu once, or the old settings address that redirects', () => {
  const old = ['schedule', 'slots', 'show-updates', 'booth', 'setlists', 'library', 'music-library', 'media', 'autoschedule', 'requests', 'blocked-words',
    'users', 'training', 'studio-form', 'phone-changes', 'phone-lookup', 'birthdays', 'notify', 'launch-email', 'feedback', 'site-text',
    'listening-limits', 'easter-eggs', 'stats', 'server-load', 'tests', 'docs'].map(p => `/admin/${p}`)
  const all = hrefs('admin')
  for (const h of old) assert.equal(all.filter(x => x === h).length, 1, h)
  assert.ok(all.includes('/admin/expert'))
  assert.equal(oldSettingsTarget(null), '/admin#system') // the old /admin/settings
})

test('old links with a # keep working', () => {
  assert.equal(LEGACY_HASH.onair, 'shows'); assert.equal(LEGACY_HASH.settings, 'system'); assert.equal(LEGACY_HASH.messages, 'customize')
  for (const target of Object.values(LEGACY_HASH)) assert.ok(SECTIONS.some(s => s.id === target), target)
})

test('a setting opens the page it lives on with the row highlighted', () => {
  assert.equal(settingPage('limits.student.idleMin'), '/admin/listening-limits')
  assert.equal(settingPage('slots.afterHours'), '/admin/slots')
  assert.equal(settingPage('cpu.protection'), '/admin/server-load')
  assert.equal(settingPage('auto.horizonHours'), '/admin/expert')
  assert.equal(settingHref('cpu.budgetHours'), '/admin/server-load?focus=cpu.budgetHours')
  assert.equal(oldSettingsTarget('slots.weekLimit'), '/admin/slots?focus=slots.weekLimit')
})

test('badges: Show requests carries the pending count, Bugs and ideas the report count', () => {
  const badge = (h: string) => SECTIONS.flatMap(s => s.tiles).find(t => t.href === h)?.badge
  assert.equal(badge('/admin/slots'), 'pending'); assert.equal(badge('/admin/feedback'), 'reports')
})

test('search finds pages by any word in any order and respects the role', () => {
  assert.deepEqual(searchMenu('admin', 'listening still').map(e => e.href), ['/admin/listening-limits'])
  assert.equal(searchMenu('director', 'server load').length, 0)
  assert.ok(searchMenu('director', 'requests').some(e => e.href === '/admin/slots'))
  assert.deepEqual(searchMenu('admin', '   '), [])
})

test('search also finds settings for admins, and never for E-board', () => {
  const extra = [{ href: '/admin/server-load?focus=cpu.budgetHours', title: 'Monthly server time allowance', text: 'Vercel hours', where: 'Settings · Server time', keywords: 'zzbudget' }]
  const hit = searchMenu('admin', 'zzbudget', extra)
  assert.equal(hit.length, 1)
  assert.equal(hit[0].setting, true)
  assert.equal(hit[0].href, '/admin/server-load?focus=cpu.budgetHours')
  assert.equal(searchMenu('director', 'zzbudget', extra).length, 0)
})

test('the panel is called Settings and a person never reads "Director"', () => {
  const all = SECTIONS.flatMap(s => [s.title, ...s.tiles.flatMap(t => [t.title, t.text])]).join(' ')
  assert.ok(!/\bDirectors?\b/.test(all))
  assert.ok(!/Admin Panel/.test(all))
})
