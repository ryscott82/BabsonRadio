import test from 'node:test'
import assert from 'node:assert/strict'
import { TOKEN_CACHE_MAX, TOKEN_TTL_MS, createTokenCache } from './tokenCache.ts'

interface Tok { uid: string; exp: number; email?: string }
const sec = (ms: number) => Math.floor(ms / 1000)

function setup(over: { ttlMs?: number; max?: number } = {}) {
  let t = 1_800_000_000_000
  const c = createTokenCache<Tok>({ now: () => t, ...over })
  return { c, tick: (ms: number) => { t += ms }, now: () => t }
}

test('a verified token is remembered for 5 minutes, then checked again', () => {
  assert.equal(TOKEN_TTL_MS, 5 * 60_000)
  const { c, tick, now } = setup()
  const tok: Tok = { uid: 'u1', exp: sec(now()) + 3600 }
  assert.equal(c.get('abc'), null)
  c.set('abc', tok)
  assert.equal(c.get('abc'), tok)
  tick(4 * 60_000 + 59_000)
  assert.equal(c.get('abc'), tok)
  tick(2_000)
  assert.equal(c.get('abc'), null) // past 5 minutes
  assert.equal(c.size(), 0) // and it was dropped
})

test('never kept past the token\'s own expiry', () => {
  const { c, tick, now } = setup()
  const tok: Tok = { uid: 'u1', exp: sec(now()) + 90 } // expires in 90 s
  c.set('short', tok)
  tick(89_000)
  assert.equal(c.get('short'), tok)
  tick(2_000)
  assert.equal(c.get('short'), null)
})

test('an already expired token is never stored', () => {
  const { c, now } = setup()
  c.set('old', { uid: 'u1', exp: sec(now()) - 10 })
  assert.equal(c.size(), 0)
  assert.equal(c.get('old'), null)
})

test('a different or altered token is a miss: the cache is keyed by the exact token text', () => {
  const { c, now } = setup()
  c.set('header.payload.sig', { uid: 'u1', exp: sec(now()) + 3600 })
  assert.equal(c.get('header.payload.sig2'), null)
  assert.equal(c.get('header.payload2.sig'), null)
  assert.equal(c.get(''), null)
})

test('forgetUid drops every remembered token for that person only', () => {
  const { c, now } = setup()
  const exp = sec(now()) + 3600
  c.set('a1', { uid: 'u1', exp }); c.set('a2', { uid: 'u1', exp }); c.set('b1', { uid: 'u2', exp })
  c.forgetUid('u1')
  assert.equal(c.get('a1'), null)
  assert.equal(c.get('a2'), null)
  assert.ok(c.get('b1'))
  assert.equal(c.size(), 1)
})

test('it stays small: when full, lapsed entries go first, then the oldest', () => {
  assert.ok(TOKEN_CACHE_MAX <= 5000)
  const { c, tick, now } = setup({ max: 3 })
  const exp = () => sec(now()) + 3600
  c.set('t1', { uid: 'u1', exp: exp() }); tick(1000)
  c.set('t2', { uid: 'u2', exp: exp() }); tick(1000)
  c.set('t3', { uid: 'u3', exp: exp() })
  c.set('t4', { uid: 'u4', exp: exp() })
  assert.equal(c.size(), 3)
  assert.equal(c.get('t1'), null) // oldest went
  assert.ok(c.get('t2') && c.get('t3') && c.get('t4'))
  // lapsed ones are cleared before live ones
  tick(5 * 60_000 + 1)
  c.set('t5', { uid: 'u5', exp: exp() })
  assert.equal(c.size(), 1)
})

test('counts hits and misses, so the admin page can show how much the cache saves', () => {
  const { c, now } = setup()
  c.set('x', { uid: 'u', exp: sec(now()) + 3600 })
  c.get('x'); c.get('x'); c.get('nope')
  assert.deepEqual(c.stats(), { hits: 2, misses: 1 })
})
