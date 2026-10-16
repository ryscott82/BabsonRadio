import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Birthdays and age ranges are stored encrypted (AES-256-GCM), never as plain text.
// PII_KEY = 32 random bytes, base64. Make one with:  openssl rand -base64 32
// Keep a copy somewhere safe: without it, saved birthdays can't be read again.
function key(): Buffer {
  const k = Buffer.from(process.env.PII_KEY ?? '', 'base64')
  if (k.length !== 32) throw new Error('PII_KEY must be set to 32 random bytes, base64 (openssl rand -base64 32)')
  return k
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), ct].map(b => b.toString('base64url')).join('.')
}

export function decryptJson<T>(text: string): T {
  const [iv, tag, ct] = text.split('.').map(p => Buffer.from(p, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8')) as T
}
