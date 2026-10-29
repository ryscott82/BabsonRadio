import { ART_SAFE_HEADERS, allowedArtType, allowedArtUrl } from '@/lib/artProxy'

export const runtime = 'nodejs'

// Same-origin copy of a cover picture, so the page can read its colors (the radio server's pictures don't allow cross-origin reads).
// Only this station's pictures (/api/station/babson_radio/...) on the station's AzuraCast server are passed through, and only
// JPEG, PNG and WebP (never SVG). The host is shared with other stations, so anything else on it is refused.
export async function GET(req: Request) {
  const u = allowedArtUrl(new URL(req.url).searchParams.get('u') ?? '', process.env.AZURACAST_URL)
  if (!u) return new Response('Not allowed', { status: 400, headers: ART_SAFE_HEADERS })
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000)
    const r = await fetch(u, { signal: ctl.signal, redirect: 'error' }).finally(() => clearTimeout(t))
    const type = allowedArtType(r.headers.get('content-type'))
    if (!r.ok || !type) return new Response('Not found', { status: 404, headers: ART_SAFE_HEADERS })
    const buf = await r.arrayBuffer()
    if (buf.byteLength > 4_000_000) return new Response('Too big', { status: 413, headers: ART_SAFE_HEADERS })
    return new Response(buf, { headers: { ...ART_SAFE_HEADERS, 'content-type': type, 'cache-control': 'public, max-age=86400, s-maxage=86400' } })
  } catch { return new Response('Bad request', { status: 400, headers: ART_SAFE_HEADERS }) }
}
