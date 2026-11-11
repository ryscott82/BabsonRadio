import test from 'node:test'
import assert from 'node:assert/strict'
import { createLastKnown } from './lastKnown.ts'

test('an answer is remembered until it is older than the limit', () => {
  const m = createLastKnown<string>()
  m.remember('a', 'one', 1000)
  assert.equal(m.recall('a', 500, 1400), 'one')
  assert.equal(m.recall('a', 500, 1500), undefined)
  assert.equal(m.recall('b', 500, 1400), undefined)
})

test('peek returns the last answer whatever its age, and forget removes it', () => {
  const m = createLastKnown<number>()
  m.remember('k', 7, 0)
  assert.deepEqual(m.peek('k'), { at: 0, value: 7 })
  m.forget('k')
  assert.equal(m.peek('k'), undefined)
})

test('allow lets one request through per gap and refuses the ones in between', () => {
  const m = createLastKnown()
  assert.equal(m.allow('u', 1000, 0), true)
  assert.equal(m.allow('u', 1000, 999), false)
  assert.equal(m.allow('u', 1000, 1000), true)
  assert.equal(m.allow('other', 1000, 1001), true)
})

test('allow keeps the last remembered answer', () => {
  const m = createLastKnown<string>()
  m.remember('u', 'answer', 0)
  m.allow('u', 10, 100)
  assert.equal(m.peek('u')?.value, 'answer')
})

test('the oldest entries go first when the memory is full', () => {
  const m = createLastKnown<number>(3)
  for (let i = 0; i < 5; i++) m.remember(`k${i}`, i, i)
  assert.equal(m.size(), 3)
  assert.equal(m.peek('k0'), undefined)
  assert.equal(m.peek('k1'), undefined)
  assert.equal(m.peek('k4')?.value, 4)
  m.remember('k2', 99, 10) // touching an entry makes it the newest
  m.remember('k5', 5, 11)
  assert.equal(m.peek('k2')?.value, 99)
  assert.equal(m.peek('k3'), undefined)
  m.clear()
  assert.equal(m.size(), 0)
})
