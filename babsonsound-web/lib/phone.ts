// Shared (browser + server). The iOS app must normalise and hash identically:
//   hash = hex( SHA-256( utf8( "+1XXXXXXXXXX" ) ) )

/** US numbers only (matches the app's phone field). Returns E.164 or null. */
export function normalizeUS(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return null
  if (d[0] === '0' || d[0] === '1') return null // invalid NANP area code
  return `+1${d}`
}

/**
 * Babson's own phone lines (Public Safety, advising, offices) are public numbers, not people.
 * Keep in step with `blockedNumberPrefixes` in ContactsManager (ProfileView.swift). Prefixes are 10-digit-number prefixes, 6+ digits.
 */
export const BLOCKED_NUMBER_PREFIXES = ['781239']

export function isBlockedNumber(raw: string): boolean {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return BLOCKED_NUMBER_PREFIXES.some(p => d.startsWith(p))
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}
