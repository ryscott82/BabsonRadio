import test from 'node:test'
import assert from 'node:assert/strict'
import { ART_SAFE_HEADERS, allowedArtType, allowedArtUrl } from './artProxy.ts'

const BASE = 'https://a12.asurahosting.com'
const ok = (p: string) => allowedArtUrl(`${BASE}${p}`, BASE)?.toString() ?? null

test('only this station\'s paths on the AzuraCast host pass', () => {
  assert.equal(ok('/api/station/babson_radio/art/abc123.jpg'), `${BASE}/api/station/babson_radio/art/abc123.jpg`)
  assert.equal(ok('/api/station/babson_radio/art/abc123.jpg?1700000000')?.includes('?1700000000'), true)
  assert.equal(ok('/api/station/other_station/art/abc.jpg'), null) // another station on the shared host
  assert.equal(ok('/api/station/babson_radio'), null)
  assert.equal(ok('/api/station/babson_radio/'), null)
  assert.equal(ok('/api/stations'), null)
  assert.equal(ok('/'), null)
  assert.equal(ok('/static/uploads/x.jpg'), null)
})

test('dot-segments and encoded tricks cannot leave the station\'s folder', () => {
  assert.equal(ok('/api/station/babson_radio/../other_station/art/a.jpg'), null)
  assert.equal(ok('/api/station/babson_radio/%2e%2e/other_station/art/a.jpg'), null)
  assert.equal(ok('/api/station/babson_radio/%2E%2E/%2E%2E/admin'), null)
})

test('other hosts, schemes and credentials are refused', () => {
  assert.equal(allowedArtUrl('https://evil.example/api/station/babson_radio/art/a.jpg', BASE), null)
  assert.equal(allowedArtUrl('https://a12.asurahosting.com.evil.example/api/station/babson_radio/a.jpg', BASE), null)
  assert.equal(allowedArtUrl('http://a12.asurahosting.com/api/station/babson_radio/art/a.jpg', BASE), null) // different scheme than the configured host
  assert.equal(allowedArtUrl('https://user:pw@a12.asurahosting.com/api/station/babson_radio/art/a.jpg', BASE), null)
  assert.equal(allowedArtUrl('https://a12.asurahosting.com:8443/api/station/babson_radio/art/a.jpg', BASE), null)
  assert.equal(allowedArtUrl('file:///etc/passwd', BASE), null)
  assert.equal(allowedArtUrl('not a url', BASE), null)
  assert.equal(allowedArtUrl(`${BASE}/api/station/babson_radio/art/a.jpg`, undefined), null)
})

test('JPEG, PNG and WebP only: never SVG or HTML', () => {
  assert.equal(allowedArtType('image/jpeg'), 'image/jpeg')
  assert.equal(allowedArtType('image/png; charset=binary'), 'image/png')
  assert.equal(allowedArtType('IMAGE/WEBP'), 'image/webp')
  for (const t of ['image/svg+xml', 'text/html', 'image/gif', 'application/octet-stream', '', null]) assert.equal(allowedArtType(t), null, String(t))
})

test('every picture is sent with nosniff and a CSP that allows nothing', () => {
  assert.equal(ART_SAFE_HEADERS['x-content-type-options'], 'nosniff')
  assert.equal(ART_SAFE_HEADERS['content-security-policy'], "default-src 'none'")
})
