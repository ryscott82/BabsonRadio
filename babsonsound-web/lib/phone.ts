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

export async function sha256Hex(input: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}
