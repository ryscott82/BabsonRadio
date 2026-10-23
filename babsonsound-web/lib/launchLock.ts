// Launch lock, shared by proxy.ts (edge) and the server. Web Crypto only, so it runs anywhere. No server imports here.
// (The countdown screens use lib/launch.ts for the launch time; this file is the lock itself.)
//
//   LAUNCH_AT       optional, ISO time the site opens. Default: Oct 30, 2026 at 10:00 am Eastern (14:00 UTC).
//   LAUNCH_OPEN=1   manual override: open the site now, whatever the clock says.
//   LAUNCH_SECRET   random secret (16+ chars). Signs the launch pass cookie and the unsubscribe links. Falls back to CRON_SECRET.
//
// Before the launch time only developers, admins, directors, hosts, beta testers and people with `earlyAccess` get in.
// Everyone else can sign up and sign in but is "locked". At the launch time the site opens by itself: no redeploy.

export const LAUNCH_AT_DEFAULT = '2026-10-30T14:00:00Z'

export function launchAtMs(): number {
  const ms = Date.parse(process.env.LAUNCH_AT || LAUNCH_AT_DEFAULT)
  return Number.isFinite(ms) ? ms : Date.parse(LAUNCH_AT_DEFAULT)
}
export const launchAtIso = () => new Date(launchAtMs()).toISOString().replace('.000Z', 'Z')
export const launchOpen = (now = Date.now()) => process.env.LAUNCH_OPEN === '1' || now >= launchAtMs()

// ── what stays reachable while locked ──
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** Pages anyone can open before launch. Everything else redirects to the homepage. */
const PUBLIC_PAGES = ['/auth', '/privacy', '/terms', '/unsubscribe', '/delete-account', '/coming-soon', '/support']
/** APIs anyone can call before launch. /api/cron and /api/webhooks check their own secrets. */
const PUBLIC_APIS = ['/api/launch', '/api/unsubscribe', '/api/auth', '/api/cron', '/api/webhooks', '/api/health']
/** APIs a signed-in but locked person may still call: sign-up follow-ups, About you, delete account. The server checks this too. */
const LOCKED_USER_APIS = ['/api/me', '/api/auth', '/api/launch', '/api/unsubscribe', '/api/guest/status']

export const publicWhileLocked = (pathname: string) =>
  pathname === '/' || [...PUBLIC_PAGES, ...PUBLIC_APIS].some(b => under(pathname, b))
export const lockedUserMayCall = (pathname: string) => LOCKED_USER_APIS.some(b => under(pathname, b))

// ── launch pass: a signed proof, issued only to people who may get in early ──
export const PASS_COOKIE = 'br_pass'
export const PASS_HEADER = 'x-launch-pass'
const PASS_TTL_MS = 12 * 3_600_000

const secret = () => process.env.LAUNCH_SECRET || process.env.CRON_SECRET || ''
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
async function hmac(label: string, message: string): Promise<string | null> {
  const s = secret()
  if (s.length < 8) return null // no secret: fails closed (no passes, no unsubscribe links)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(`${s}|${label}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** `uid.expiresAt.signature` */
export async function makePass(uid: string, now = Date.now()): Promise<{ token: string; expiresAt: number } | null> {
  const expiresAt = now + PASS_TTL_MS
  const sig = await hmac('pass', `${uid}.${expiresAt}`)
  return sig ? { token: `${uid}.${expiresAt}.${sig}`, expiresAt } : null
}
/** The uid the pass belongs to, or null if it is missing, forged or expired. */
export async function passUid(token: string | null | undefined, now = Date.now()): Promise<string | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [uid, exp, sig] = parts
  if (!uid || !(Number(exp) > now)) return null
  const want = await hmac('pass', `${uid}.${exp}`)
  return want && safeEqual(sig, want) ? uid : null
}

// ── unsubscribe links: no login needed, never expire ──
export async function unsubscribeToken(uid: string): Promise<string | null> {
  const sig = await hmac('unsub', uid)
  return sig ? `${uid}.${sig.slice(0, 40)}` : null
}
export async function uidFromUnsubscribeToken(token: string): Promise<string | null> {
  const i = token.lastIndexOf('.')
  if (i < 1) return null
  const uid = token.slice(0, i), sig = token.slice(i + 1)
  const want = await hmac('unsub', uid)
  return want && safeEqual(sig, want.slice(0, 40)) ? uid : null
}
