import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { safeNext } from './signInPrompt.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('after sign-in or verifying, go back to the page on this site, never elsewhere', () => {
  assert.equal(safeNext('/training'), '/training')
  assert.equal(safeNext('/booth/door?c=abc'), '/booth/door?c=abc')
  assert.equal(safeNext(null), '/')
  assert.equal(safeNext(''), '/')
  assert.equal(safeNext('https://evil.example'), '/')
  assert.equal(safeNext('//evil.example'), '/')
  assert.equal(safeNext('/\\evil.example'), '/')
  assert.equal(safeNext('/auth'), '/', 'no loop back to the sign-in page')
})

test('a new account is not treated as a guest before its profile loads, and the verify screen remembers the page', () => {
  assert.match(src('contexts/AuthContext.tsx'), /if \(firebaseUser\) setLoading\(true\)\n\s+setUser\(firebaseUser\)/)
  assert.match(src('components/GuestFence.tsx'), /\/auth\?next=\$\{encodeURIComponent\(pathname\)\}/)
  assert.match(src('app/auth/page.tsx'), /router\.replace\(safeNext\(next\)\)/)
})
