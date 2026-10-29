import test from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS, WINDOW_MS, clientIp, decideSignup, emailDomain, newest } from './signupLimits.ts'

const NOW = 1_800_000_000_000
const ip = (recent: number, fails = 0, day = recent) => ({
  recent: Array.from({ length: recent }, (_, i) => NOW - 1000 * (i + 1)), fails: Array.from({ length: fails }, (_, i) => NOW - 500 * (i + 1)), day,
})
const d = (over: object = {}) => decideSignup({ now: NOW, ip: ip(0), school: true, domainThisHour: 0, globalThisMinute: 0, ...over })

test('a normal sign-up needs no check', () => {
  assert.equal(d().action, 'ok')
  assert.equal(d({ ip: null }).action, 'ok')
  assert.equal(d({ ip: ip(LIMITS.ipCaptchaInWindow - 1) }).action, 'ok')
})

test('several sign-ups from one IP ask for the check, they do not block (shared campus Wi-Fi)', () => {
  assert.equal(d({ ip: ip(LIMITS.ipCaptchaInWindow) }).action, 'captcha')
  assert.equal(d({ ip: ip(20) }).action, 'captcha')
  assert.equal(d({ ip: ip(LIMITS.ipBlockInWindow - 1) }).action, 'captcha')
})

test('clearly abusive levels block', () => {
  assert.equal(d({ ip: ip(LIMITS.ipBlockInWindow) }).action, 'block')
  assert.equal(d({ ip: ip(1, 0, LIMITS.ipBlockPerDay) }).action, 'block')
  assert.equal(d({ ip: ip(1, LIMITS.failBlockInWindow) }).action, 'block')
  assert.equal(d({ globalThisMinute: LIMITS.globalBlockPerMinute }).action, 'block')
})

test('times older than the window do not count', () => {
  const old = { recent: Array.from({ length: 30 }, () => NOW - WINDOW_MS - 1), fails: [], day: 30 }
  assert.equal(d({ ip: old }).action, 'ok')
})

test('repeated failures, a busy site and a busy domain ask for the check', () => {
  assert.equal(d({ ip: ip(1, LIMITS.failCaptchaInWindow) }).action, 'captcha')
  assert.equal(d({ globalThisMinute: LIMITS.globalCaptchaPerMinute }).action, 'captcha')
  assert.equal(d({ school: false, domainThisHour: LIMITS.domainCaptchaPerHour }).action, 'captcha')
  // the same count is normal for a school domain on launch day
  assert.equal(d({ school: true, domainThisHour: LIMITS.domainCaptchaPerHour }).action, 'ok')
  assert.equal(d({ school: true, domainThisHour: LIMITS.schoolDomainCaptchaPerHour }).action, 'captcha')
})

test('client ip and email domain', () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
  assert.equal(clientIp(h({ 'x-real-ip': ' 1.2.3.4 ', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4')
  assert.equal(clientIp(h({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })), '5.6.7.8')
  assert.equal(clientIp(h({})), '')
  assert.equal(emailDomain('A@Gmail.com'), 'gmail.com')
  assert.deepEqual(newest([1, 2, 3, 4], 2), [3, 4])
})
