import test from 'node:test'
import assert from 'node:assert/strict'
import { listUnsubscribeHeaders } from './mailHeaders.ts'

test('mailto only: the plain header, no one-click', () => {
  assert.deepEqual(listUnsubscribeHeaders({ mailto: 'hello@babsonradio.com' }), { 'List-Unsubscribe': '<mailto:hello@babsonradio.com?subject=unsubscribe>' })
})

test('https link: both forms and the one-click post header', () => {
  const h = listUnsubscribeHeaders({ mailto: 'hello@babsonradio.com', url: 'https://babsonradio.com/api/unsubscribe?t=abc' })
  assert.equal(h['List-Unsubscribe'], '<mailto:hello@babsonradio.com?subject=unsubscribe>, <https://babsonradio.com/api/unsubscribe?t=abc>')
  assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})

test('anything that is not a clean address or https link is dropped (no header injection)', () => {
  assert.deepEqual(listUnsubscribeHeaders({}), {})
  assert.deepEqual(listUnsubscribeHeaders({ mailto: 'a b@x.com', url: 'http://insecure.example/x' }), {})
  assert.deepEqual(listUnsubscribeHeaders({ url: 'https://x.com/a>\r\nBcc: z@z.com' }), {})
})
