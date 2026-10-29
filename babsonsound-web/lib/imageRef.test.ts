import test from 'node:test'
import assert from 'node:assert/strict'
import { imageRefOk } from './imageRef.ts'

const BUCKET = 'babson-radio.firebasestorage.app'
const TOKEN = '3f2b1c4e-1111-4222-8333-944455556666'
const FILE = '0a1b2c3d-1111-4222-8333-944455556666'
const path = `schedule/user123/${FILE}.jpg`
const url = (p = path, b = BUCKET, q = `alt=media&token=${TOKEN}`) => `https://firebasestorage.googleapis.com/v0/b/${b}/o/${encodeURIComponent(p)}?${q}`

test('the exact link we made for that path in our bucket is accepted', () => {
  assert.equal(imageRefOk(url(), path, BUCKET, 'user123'), true)
  assert.equal(imageRefOk(url(), path, BUCKET, null), true) // admin / director: any schedule folder
})

test('another bucket, a different path, or someone else\'s folder is refused', () => {
  assert.equal(imageRefOk(url(path, 'attacker-bucket'), path, BUCKET, 'user123'), false)
  const other = `schedule/user123/${TOKEN}.jpg`
  assert.equal(imageRefOk(url(other), path, BUCKET, 'user123'), false) // URL points at a different file than the path says
  assert.equal(imageRefOk(url(), path, BUCKET, 'someoneElse'), false)
  assert.equal(imageRefOk(url(), path, undefined, 'user123'), false)
})

test('odd paths, hosts, extra parameters and look-alike encodings are refused', () => {
  const evil = `schedule/user123/../x.jpg`
  assert.equal(imageRefOk(url(evil), evil, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(url(`schedule/user123/${FILE}.svg`), `schedule/user123/${FILE}.svg`, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(url(path, BUCKET, `alt=media&token=${TOKEN}&x=1`), path, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(url(path, BUCKET, 'alt=media'), path, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(url().replace('firebasestorage.googleapis.com', 'evil.example'), path, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(url().replace('https://', 'https://u:p@'), path, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(url() + '#frag', path, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(path.replace(/\//g, '%2F') as unknown, path, BUCKET, 'user123'), false)
  assert.equal(imageRefOk(42, path, BUCKET, 'user123'), false)
})
