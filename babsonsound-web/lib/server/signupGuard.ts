import 'server-only'
import { createHmac } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { HttpError } from './http'
import { hasValidAppCheck } from './appCheck'
import { verifyTurnstile } from './turnstile'
import { clientIp, decideSignup, emailDomain, newest } from '../signupLimits'
import { isSchoolEmail } from './access'

// Counters live in three small collections, each doc with an `expireAt` field (set a Firestore TTL policy on it):
//   signupIp/{hmac(ip)}_{yyyymmdd}      recent attempt times, recent failure times, day total   (one doc per IP per day)
//   signupDomain/{domain}_{yyyymmddhh}  attempts this hour for one email domain
//   signupGlobal/{epochMinute}          attempts this minute, whole site
// A sign-up costs 3 reads and 3 writes (4 if it fails). IPs are stored only as a keyed hash.
const keyed = (s: string) => createHmac('sha256', process.env.PII_KEY ?? 'br-signup').update(s).digest('hex').slice(0, 24)
const stamp = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 10) // yyyymmddhh
const DAY = 86_400_000

export type SignupGuard = { fail(): Promise<void> }

/** Checks the limits for one sign-up attempt, records it, and returns a handle to record a failure. Throws 403 BR-ACC-022 (check needed) or 429 BR-ACC-023. */
export async function signupGuard(req: Request, email: string, captchaToken?: unknown): Promise<SignupGuard> {
  const now = Date.now()
  const db = adminDb()
  const ip = clientIp(req.headers)
  const domain = emailDomain(email).replace(/[^a-z0-9.-]/g, '_').slice(0, 80)
  const dayStamp = stamp(new Date(now)).slice(0, 8)
  const ipRef = ip ? db.collection('signupIp').doc(`${keyed(ip)}_${dayStamp}`) : null
  const domRef = db.collection('signupDomain').doc(`${domain}_${stamp(new Date(now))}`)
  const glRef = db.collection('signupGlobal').doc(String(Math.floor(now / 60_000)))

  const snaps = await db.getAll(...(ipRef ? [ipRef, domRef, glRef] : [domRef, glRef]))
  const ipSnap = ipRef ? snaps[0] : null
  const [domSnap, glSnap] = ipRef ? [snaps[1], snaps[2]] : [snaps[0], snaps[1]]
  const ipData = ipSnap?.exists
    ? { recent: (ipSnap.get('recent') as number[]) ?? [], fails: (ipSnap.get('fails') as number[]) ?? [], day: (ipSnap.get('day') as number) ?? 0 }
    : { recent: [], fails: [], day: 0 }

  const verdict = decideSignup({
    now, ip: ipRef ? ipData : null, school: isSchoolEmail(email),
    domainThisHour: (domSnap.get('n') as number) ?? 0, globalThisMinute: (glSnap.get('n') as number) ?? 0,
  })
  if (verdict.action === 'block') {
    console.warn('[signup blocked]', verdict.reason)
    throw new HttpError(429, 'Too many sign-ups right now. Try again in a few minutes.', 'BR-ACC-023')
  }
  if (verdict.action === 'captcha') {
    // The iOS app proves itself with App Check; the website with a Turnstile token.
    const passed = (await hasValidAppCheck(req)) || (await verifyTurnstile(captchaToken, ip))
    if (passed === false) throw new HttpError(403, 'Quick check needed. Complete it and try again.', 'BR-ACC-022')
    if (passed === null) console.warn('[signup] check wanted but Turnstile is not set up or unreachable; letting this one through')
  }

  const recent = newest([...ipData.recent, now])
  const batch = db.batch()
  const expireAt = (ms: number) => Timestamp.fromMillis(now + ms)
  if (ipRef) batch.set(ipRef, { recent, fails: ipData.fails, day: ipData.day + 1, expireAt: expireAt(2 * DAY) })
  batch.set(domRef, { n: ((domSnap.get('n') as number) ?? 0) + 1, expireAt: expireAt(2 * 3_600_000) })
  batch.set(glRef, { n: ((glSnap.get('n') as number) ?? 0) + 1, expireAt: expireAt(10 * 60_000) })
  await batch.commit()

  return {
    fail: async () => {
      if (!ipRef) return
      await ipRef.set({ fails: newest([...ipData.fails, Date.now()]) }, { merge: true }).catch(() => {})
    },
  }
}
