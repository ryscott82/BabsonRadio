import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SUPPORT_EMAIL, supportEmail } from './contactEmail.ts'

test('SUPPORT_EMAIL wins, then CONTACT_EMAIL, then the site address', () => {
  assert.equal(supportEmail({ SUPPORT_EMAIL: 'help@babsonradio.com', CONTACT_EMAIL: 'old@x.com' }), 'help@babsonradio.com')
  assert.equal(supportEmail({ CONTACT_EMAIL: ' old@x.com ' }), 'old@x.com')
  assert.equal(supportEmail({}), DEFAULT_SUPPORT_EMAIL)
  assert.equal(supportEmail({ SUPPORT_EMAIL: '' }), DEFAULT_SUPPORT_EMAIL)
})
