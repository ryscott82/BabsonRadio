import { createHmac, timingSafeEqual } from 'node:crypto'

// Studio PC ("booth"): the kiosk page on babsonradio.com talks to a small helper on the studio PC (tools/studio-helper),
// which drives BUTT. Both sides share STUDIO_PC_SECRET. Two things are signed with it:
//  - attest: the helper signs a fresh nonce, so the server knows a sign-in really happened on the studio PC.
//  - control token: the server signs a short-lived token for whoever is signed in on the studio PC; the helper only obeys
//    requests that carry one. Going live and sending songs need l=true; ending the stream works with any valid token. The helper repeats this exact format in plain JS (tools/studio-helper/helper.mjs).

export const BOOTH_HELPER_PORT = 7781
export const BOOTH_HELPER_ORIGIN = `http://127.0.0.1:${BOOTH_HELPER_PORT}`
export const TOKEN_TTL_MS = 15 * 60_000
export const NONCE_MAX_AGE_MS = 2 * 60_000
/** Hosts can go live from this long before their show starts until this long after it ends. */
export const LIVE_EARLY_MS = 30 * 60_000
export const LIVE_LATE_MS = 30 * 60_000

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const mac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest()
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

/** u: uid, n: name, s: studio session id, l: may go live (false = may only end the stream), exp: ms. */
export interface BoothClaims { u: string; n: string; s: string; l: boolean; exp: number }

export function signToken(secret: string, c: BoothClaims): string {
  const body = b64(JSON.stringify(c))
  return `${body}.${b64(mac(secret, `ctl:${body}`))}`
}

export function verifyToken(secret: string, token: string, now = Date.now()): BoothClaims | null {
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  if (!same(Buffer.from(sig, 'base64url'), mac(secret, `ctl:${body}`))) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as BoothClaims
    return typeof c.exp === 'number' && c.exp > now && typeof c.u === 'string' ? c : null
  } catch { return null }
}

/** Nonce made by the page: "<ms>.<random>". */
export const attestSig = (secret: string, nonce: string) => mac(secret, `attest:${nonce}`).toString('hex')

export function verifyAttest(secret: string, nonce: string, sig: string, now = Date.now()): boolean {
  const m = /^(\d{12,14})\.[A-Za-z0-9]{8,64}$/.exec(nonce)
  if (!m || Math.abs(now - Number(m[1])) > NONCE_MAX_AGE_MS) return false
  if (!/^[0-9a-f]{64}$/.test(sig)) return false
  return same(Buffer.from(sig, 'hex'), Buffer.from(attestSig(secret, nonce), 'hex'))
}

export const liveWindowOpen = (s: { startAt: number; endAt: number }, now: number) =>
  now >= s.startAt - LIVE_EARLY_MS && now <= s.endAt + LIVE_LATE_MS
