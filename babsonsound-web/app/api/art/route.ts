export const runtime = 'nodejs'

// Same-origin copy of a cover picture, so the page can read its colors (the radio server's pictures don't allow cross-origin reads).
// Only pictures from the station's own AzuraCast server are passed through.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('u') ?? ''
  const base = process.env.AZURACAST_URL
  try {
    const u = new URL(raw)
    if (!base || u.host !== new URL(base).host || !/^https?:$/.test(u.protocol)) return new Response('Not allowed', { status: 400 })
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000)
    const r = await fetch(u, { signal: ctl.signal, redirect: 'error' }).finally(() => clearTimeout(t))
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !type.startsWith('image/')) return new Response('Not found', { status: 404 })
    const buf = await r.arrayBuffer()
    if (buf.byteLength > 4_000_000) return new Response('Too big', { status: 413 })
    return new Response(buf, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400, s-maxage=86400' } })
  } catch { return new Response('Bad request', { status: 400 }) }
}
