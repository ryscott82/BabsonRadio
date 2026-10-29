import 'server-only'
import { createHash, createHmac } from 'node:crypto'
import { BLOCKED_NUMBER_PREFIXES, sha256Hex } from '../phone'

function pepper(): string {
  const p = process.env.PHONE_HASH_PEPPER
  if (!p || p.length < 16) throw new Error('PHONE_HASH_PEPPER must be set (16+ chars)')
  return p
}

/** Index key from a client-supplied SHA-256 hash of an E.164 number. */
export function indexKeyFromHash(sha256: string): string {
  return createHmac('sha256', pepper()).update(sha256.toLowerCase()).digest('hex')
}

/** The 8-byte tag stored in place of a hash on a member's contactSyncs doc (see lib/contactLimits.ts). Not the hash, and not the index key. */
export function seenIdOfHash(sha256: string): string {
  return createHmac('sha256', pepper()).update('seen:' + sha256.toLowerCase()).digest('hex').slice(0, 16)
}

export async function indexKeyFromE164(e164: string): Promise<string> {
  return indexKeyFromHash(await sha256Hex(e164))
}

let blocked: Set<string> | null = null
/** SHA-256 (hex) of every number on a blocked prefix, as phones send them. Built once; 10,000 numbers per 6-digit prefix. */
export function blockedHashes(): Set<string> {
  if (blocked) return blocked
  const out = new Set<string>()
  for (const p of BLOCKED_NUMBER_PREFIXES) {
    const rest = 10 - p.length
    if (rest < 0 || rest > 4) throw new Error(`Blocked prefix "${p}" must be 6 to 10 digits`)
    for (let n = 0; n < 10 ** rest; n++) {
      out.add(createHash('sha256').update(`+1${p}${String(n).padStart(rest, '0')}`).digest('hex'))
    }
  }
  return (blocked = out)
}

/** Drops hashes of Babson's own lines from a contact list before anything is looked up, counted or stored. */
export const withoutBlocked = (hashes: string[]): string[] => {
  const b = blockedHashes()
  return hashes.filter(h => !b.has(h.toLowerCase()))
}
