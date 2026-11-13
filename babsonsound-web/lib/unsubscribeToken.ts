// Signed unsubscribe links: no login needed, never expire. Web Crypto only, so it runs anywhere. No server imports here.
// LAUNCH_SECRET (or CRON_SECRET) is the signing secret. Changing it breaks the unsubscribe links already sent.

const secret = () => process.env.LAUNCH_SECRET || process.env.CRON_SECRET || ''
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
// The imported signing key is kept per label (importing it again on every request was wasted work).
const keys = new Map<string, Promise<CryptoKey>>()
async function hmac(label: string, message: string): Promise<string | null> {
  const s = secret()
  if (s.length < 8) return null // no secret: fails closed (no unsubscribe links)
  const enc = new TextEncoder()
  const id = `${s}|${label}`
  let key = keys.get(id)
  if (!key) { key = crypto.subtle.importKey('raw', enc.encode(id), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); keys.set(id, key) }
  return hex(await crypto.subtle.sign('HMAC', await key, enc.encode(message)))
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

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

// One-tap "turn off show reminders" links in reminder emails. Same signing secret, a different label, so an unsubscribe link cannot be used here or the other way round.
export async function reminderOffToken(uid: string): Promise<string | null> {
  const sig = await hmac('remind-off', uid)
  return sig ? `${uid}.${sig.slice(0, 40)}` : null
}
export async function uidFromReminderOffToken(token: string): Promise<string | null> {
  const i = token.lastIndexOf('.')
  if (i < 1) return null
  const uid = token.slice(0, i), sig = token.slice(i + 1)
  const want = await hmac('remind-off', uid)
  return want && safeEqual(sig, want.slice(0, 40)) ? uid : null
}
