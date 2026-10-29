// Rules for /api/art, the same-origin copy of station cover pictures. Plain functions so the tests can run them.
// a12.asurahosting.com is shared with other stations, so only this station's own paths are passed through.

export const ART_PATH_PREFIX = '/api/station/babson_radio/'
export const ART_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const // never SVG: it can carry script

/** The URL to fetch, or null when it is not one of this station's pictures on the AzuraCast host. */
export function allowedArtUrl(raw: string, base: string | undefined): URL | null {
  if (!base) return null
  let u: URL, b: URL
  try { u = new URL(raw); b = new URL(base) } catch { return null }
  if (!/^https?:$/.test(u.protocol) || u.protocol !== b.protocol) return null
  if (u.host !== b.host || u.username || u.password) return null
  // URL parsing has already resolved "..", "." and their %2e forms, so this check sees the real path.
  if (!u.pathname.startsWith(ART_PATH_PREFIX) || u.pathname.length === ART_PATH_PREFIX.length) return null
  return u
}

/** The bare image type if it is one we serve, else null. Parameters like "; charset" are dropped. */
export function allowedArtType(contentType: string | null): (typeof ART_TYPES)[number] | null {
  const t = (contentType ?? '').split(';')[0].trim().toLowerCase()
  return (ART_TYPES as readonly string[]).includes(t) ? (t as (typeof ART_TYPES)[number]) : null
}

/** Headers on every picture we send: it can be shown as an image but never run as a page. */
export const ART_SAFE_HEADERS = { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } as const
