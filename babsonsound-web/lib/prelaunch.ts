// Pre-launch gate shared by proxy.ts and the unlock route. Uses Web Crypto only, so it runs anywhere.
//
//   PRELAUNCH_PASSWORD  the developer password (set in Vercel).
//   PRELAUNCH_OFF=1     open the site to everyone (launch day). Remove the password afterwards if you like.
//
// The gate is ON unless PRELAUNCH_OFF=1. If it's on and no password is set, nobody can unlock it
// (it fails closed rather than exposing the site).

// Session cookie set by the browser itself and deleted on every refresh/close (components/PreviewLock.tsx).
// Renamed from 'br_pre' so older 30-day cookies from the first version stop working.
export const PRELAUNCH_COOKIE = 'br_pre_s'
export const LAUNCH_ISO = '2026-10-30T10:00:00-04:00' // Oct 30 at 10:00 am Eastern (EDT)

export const prelaunchOn = () => process.env.PRELAUNCH_OFF !== '1'

/** Cookie/header value derived from the password. Changing the password invalidates old cookies. */
export async function prelaunchToken(secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('br-prelaunch-v1'))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** True if the supplied password (typed or sent in X-Preview-Key) matches. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const pw = process.env.PRELAUNCH_PASSWORD
  if (!pw || !candidate) return false
  return safeEqual(await prelaunchToken(candidate), await prelaunchToken(pw))
}

/** Key for the calendar feed URL before launch (calendar apps can't send our cookie). Grants the feed only. */
export async function calendarKey(): Promise<string | null> {
  const pw = process.env.PRELAUNCH_PASSWORD
  return pw ? (await prelaunchToken(`${pw}|calendar`)).slice(0, 24) : null
}

/** True if this cookie value is the valid token for the current password. */
export async function cookieValid(value: string | undefined): Promise<boolean> {
  const pw = process.env.PRELAUNCH_PASSWORD
  if (!pw || !value) return false
  return safeEqual(value, await prelaunchToken(pw))
}
