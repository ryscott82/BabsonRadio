import 'server-only'
import { createHmac } from 'node:crypto'
import { sha256Hex } from '../phone'

function pepper(): string {
  const p = process.env.PHONE_HASH_PEPPER
  if (!p || p.length < 16) throw new Error('PHONE_HASH_PEPPER must be set (16+ chars)')
  return p
}

/** Index key from a client-supplied SHA-256 hash of an E.164 number. */
export function indexKeyFromHash(sha256: string): string {
  return createHmac('sha256', pepper()).update(sha256.toLowerCase()).digest('hex')
}

export async function indexKeyFromE164(e164: string): Promise<string> {
  return indexKeyFromHash(await sha256Hex(e164))
}
