import test from 'node:test'
import assert from 'node:assert/strict'
import { SECTIONS, menuFor, searchMenu } from './adminMenu.ts'

const titles = (role: 'director' | 'admin') => menuFor(role).map(s => s.title)
const hrefs = (role: 'director' | 'admin') => menuFor(role).flatMap(s => s.tiles.map(t => t.href))

test('a director sees Today, Shows, Music, People and Messages, and no Settings or System', () => {
  assert.deepEqual(titles('director'), ['Today', 'Shows', 'Music', 'People', 'Messages'])
})

test('an admin sees seven headings, with Settings and System last', () => {
  assert.deepEqual(titles('admin'), ['Today', 'Shows', 'Music', 'People', 'Messages', 'Settings', 'System'])
})

test('a director never gets an admin-only page, and no heading is left empty', () => {
  const adminOnly = SECTIONS.flatMap(s => s.tiles).filter(t => t.admin).map(t => t.href)
  assert.ok(adminOnly.length > 10)
  for (const h of hrefs('director')) assert.ok(!adminOnly.includes(h), h)
  for (const s of menuFor('director').slice(1)) assert.ok(s.tiles.length > 0, s.id)
  assert.ok(!hrefs('director').includes('/admin/settings'))
  assert.ok(!hrefs('director').includes('/admin/server-load'))
})

test('directors keep the pages they could open before the redesign', () => {
  for (const h of ['/admin/schedule', '/admin/slots', '/admin/show-updates', '/admin/stats', '/admin/booth', '/admin/library', '/admin/requests', '/admin/training', '/admin/feedback']) {
    assert.ok(hrefs('director').includes(h), h)
  }
})

test('every URL from the old menu is still in the admin menu, once', () => {
  const old = ['schedule', 'slots', 'show-updates', 'booth', 'setlists', 'library', 'music-library', 'media', 'autoschedule', 'requests', 'blocked-words',
    'users', 'training', 'studio-form', 'phone-changes', 'phone-lookup', 'birthdays', 'notify', 'launch-email', 'feedback', 'site-text',
    'listening-limits', 'easter-eggs', 'stats', 'server-load', 'tests', 'docs'].map(p => `/admin/${p}`)
  const all = hrefs('admin')
  for (const h of old) assert.equal(all.filter(x => x === h).length, 1, h)
  assert.ok(all.includes('/admin/settings'))
})

test('search finds pages by any word in any order and respects the role', () => {
  assert.deepEqual(searchMenu('admin', 'limits listening').map(e => e.href), ['/admin/listening-limits'])
  assert.equal(searchMenu('director', 'server load').length, 0)
  assert.ok(searchMenu('director', 'requests').some(e => e.href === '/admin/slots'))
  assert.deepEqual(searchMenu('admin', '   '), [])
})

test('search also finds settings for admins, and never for directors', () => {
  const extra = [{ href: '/admin/settings?focus=cpu.budgetHours', title: 'Monthly server time allowance', text: 'Vercel hours', where: 'Settings · Server time', keywords: 'vercel' }]
  const hit = searchMenu('admin', 'allowance', extra)
  assert.equal(hit.length, 1)
  assert.equal(hit[0].setting, true)
  assert.equal(hit[0].href, '/admin/settings?focus=cpu.budgetHours')
  assert.equal(searchMenu('director', 'allowance', extra).length, 0)
})
