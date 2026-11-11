import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEMO_DELETE_MESSAGE } from './demoAccount.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('deleting the demo account is a no-op with a friendly message, decided before any deletion code runs', () => {
  const route = src('app/api/me/delete/route.ts')
  const gate = route.indexOf('.demo) return')
  assert.ok(gate > 0, 'route has a demo gate')
  assert.ok(gate < route.indexOf('deleteAccountData(t.uid)'), 'gate comes before the delete')
  assert.match(route, /kept: true/)
  assert.ok(DEMO_DELETE_MESSAGE.length > 40 && !/error|failed/i.test(DEMO_DELETE_MESSAGE))
})

test('the demo account stays out of the admin people lists and cannot be deleted from admin or by the sweep', () => {
  assert.match(src('app/api/admin/users/route.ts'), /get\('demo'\) !== true/)
  assert.match(src('app/api/admin/training/route.ts'), /get\('demo'\) !== true/)
  assert.match(src('app/api/admin/listening/route.ts'), /get\('demo'\) === true/)
  assert.match(src('app/api/admin/users/delete/route.ts'), /get\('demo'\) === true/)
  assert.match(src('lib/server/unverified.ts'), /demo: s\.get\('demo'\) === true/)
})

test('the demo account is created unsubscribed so no launch or bulk email goes to it', () => {
  assert.match(src('scripts/create-account.mjs'), /demo: true, unsubscribed: true/)
})
