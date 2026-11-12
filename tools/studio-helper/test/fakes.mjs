// A pretend AzuraCast (flow.js upload rules copied from AzuraCast's Service/Flow.php) and a pretend website, for the tests.

export function fakeAzura({ failPosts = 0, failAfterChunk = 0, down = false } = {}) {
  const chunks = new Map() // identifier -> Map(n -> bytes)
  const files = new Map()  // path -> bytes
  let posts = 0, gets = 0, failsLeft = failPosts
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    if (down) throw new TypeError('fetch failed')
    if (u.pathname.endsWith('/files/mkdir')) return new Response('{}', { status: 200 })
    if (u.pathname.endsWith('/files/list')) {
      const dir = u.searchParams.get('currentDirectory')
      const rows = [...files.keys()].filter(p => p.startsWith(`${dir}/`)).map((p, i) => ({ path: p, media: { id: 100 + i } }))
      return Response.json(rows)
    }
    if (!u.pathname.endsWith('/files/upload')) return new Response('', { status: 404 })
    if (init.method === 'GET') {
      gets++
      const p = u.searchParams, id = p.get('flowIdentifier'), n = Number(p.get('flowChunkNumber')), total = Number(p.get('flowTotalChunks'))
      const have = chunks.get(id)?.get(n)
      return new Response(null, { status: n !== total && have && have.length === Number(p.get('flowCurrentChunkSize')) ? 200 : 204 })
    }
    posts++
    const f = init.body
    const n = Number(f.get('flowChunkNumber'))
    if (failsLeft > 0 && (!failAfterChunk || n > failAfterChunk)) { failsLeft--; return new Response('busy', { status: 503 }) }
    const id = f.get('flowIdentifier'), total = Number(f.get('flowTotalChunks')), size = Number(f.get('flowTotalSize'))
    const data = new Uint8Array(await f.get('file_data').arrayBuffer())
    if (data.length !== Number(f.get('flowCurrentChunkSize'))) return Response.json({ success: false, message: 'size mismatch' }, { status: 500 })
    if (!chunks.has(id)) chunks.set(id, new Map())
    chunks.get(id).set(n, data)
    if (n !== total) return new Response(null, { status: 200 })
    const parts = chunks.get(id)
    const got = [...parts.values()].reduce((a, b) => a + b.length, 0)
    if (parts.size !== total || got !== size) return new Response(null, { status: 204 })
    const all = new Uint8Array(size); let o = 0
    for (let i = 1; i <= total; i++) { all.set(parts.get(i), o); o += parts.get(i).length }
    files.set(`${u.searchParams.get('currentDirectory')}/${f.get('flowRelativePath')}`, all)
    chunks.delete(id)
    return Response.json({ success: true, message: 'Record created successfully.' })
  }
  return { fetch, files, chunks, stats: () => ({ posts, gets }), setDown: v => { down = v } }
}

export function fakeSite({ down = false, refuse = 0 } = {}) {
  const recs = new Map(); const calls = []
  const fetch = async (url, init) => {
    const u = new URL(url)
    calls.push(u.pathname)
    if (down) throw new TypeError('fetch failed')
    if (!init.headers['x-booth-nonce'] || !init.headers['x-booth-sig']) return Response.json({ error: 'no sig' }, { status: 403 })
    if (refuse) return Response.json({ error: 'Refused.' }, { status: refuse })
    const b = JSON.parse(init.body)
    if (u.pathname === '/api/booth/recordings/start') { if (!recs.has(b.id)) recs.set(b.id, { ...b, status: 'recording' }); return Response.json({ id: b.id }) }
    if (u.pathname === '/api/booth/recordings/complete') {
      const r = recs.get(b.id); if (!r) return Response.json({ error: 'Recording not found.' }, { status: 404 })
      Object.assign(r, { status: 'uploaded', azuracastPath: b.azuracastPath, durationSec: b.durationSec })
      return Response.json({ ok: true, attached: !!r.requestId && r.cleanConfirmed })
    }
    return new Response('', { status: 404 })
  }
  return { fetch, recs, calls, setDown: v => { down = v }, setRefuse: v => { refuse = v } }
}

/** Sends website URLs to the site fake and everything else to AzuraCast. */
export const router = (az, site) => (url, init) => (String(url).startsWith('https://site.test') ? site.fetch(url, init) : az.fetch(url, init))

export function memFs(files = {}) {
  const store = new Map(Object.entries(files))
  return {
    store,
    size: f => store.get(f).length,
    read: async (f, s, e) => store.get(f).subarray(s, e),
    remove: f => { store.delete(f) },
  }
}

export function clock(start = Date.UTC(2026, 10, 12, 15, 0)) {
  let t = start
  return { now: () => t, add: ms => { t += ms } }
}
