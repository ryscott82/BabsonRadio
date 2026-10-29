import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { securityHeaders } from './securityHeaders.ts'
import { THEME_SCRIPT } from './themeScript.ts'

const get = (env: Record<string, string> = {}) => Object.fromEntries(securityHeaders(env).map(h => [h.key, h.value]))

test('the basic headers are present', () => {
  const h = get()
  assert.match(h['Strict-Transport-Security'], /max-age=\d+/)
  assert.equal(h['X-Content-Type-Options'], 'nosniff')
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.equal(h['X-Frame-Options'], 'DENY')
  assert.match(h['Permissions-Policy'], /camera=\(\)/)
})

test('the CSP is report-only first, frame-ancestors none, and allows the inline theme script by hash', () => {
  const h = get()
  assert.equal(h['Content-Security-Policy'], undefined)
  const csp = h['Content-Security-Policy-Report-Only']
  assert.match(csp, /frame-ancestors 'none'/)
  const hash = `'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`
  assert.ok(csp.includes(hash))
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp))
})

test('it allows Typekit, Firebase, YouTube embeds and the station stream and art', () => {
  const csp = get({ NEXT_PUBLIC_STREAM_URL: 'https://a12.asurahosting.com:8000/radio.mp3' })['Content-Security-Policy-Report-Only']
  for (const s of ['https://use.typekit.net', 'https://*.googleapis.com', 'https://*.firebaseio.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com',
    'https://a12.asurahosting.com', 'https://a12.asurahosting.com:8000', 'https://challenges.cloudflare.com'])
    assert.ok(csp.includes(s), s)
})
