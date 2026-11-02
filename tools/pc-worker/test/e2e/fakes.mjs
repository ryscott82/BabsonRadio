// Fake babsonradio.com worker API (using the real checks from babsonsound-web/lib/worker.ts), fake AzuraCast and fake studio
// helper, all in one process with the Firestore stand-in. `events` records the order of change records and AzuraCast writes.
import { createServer } from 'node:http'
import { store, adminSet, Timestamp } from './fake-firestore.mjs'
import { verifyWorkerSig, nonceFresh, changeRefusal, beatKey, undoRecordId } from '../../../../babsonsound-web/lib/worker.ts'

export const events = []
export const flags = { siteLive: false, helperLive: false, fail429: 0, reconciles: 0 }
const seen = new Map()
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))) })
const json = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)) }

// ── site ──
export function startSite(port, secret) {
  const authed = req => req.headers.authorization === 'Bearer fake-id-token' || (verifyWorkerSig(secret, req.headers['x-worker-nonce'] || '', req.headers['x-worker-sig'] || '') && nonceFresh(seen, req.headers['x-worker-nonce']))
  return createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/api/nowplaying') return json(res, 200, { isLive: flags.siteLive })
    if (u.pathname === '/api/worker/token') {
      if (!verifyWorkerSig(secret, req.headers['x-worker-nonce'] || '', req.headers['x-worker-sig'] || '') || !nonceFresh(seen, req.headers['x-worker-nonce'])) return json(res, 401, { error: 'not accepted', code: 'BR-LIB-002' })
      return json(res, 200, { token: 'fake-custom-token', expiresAt: Date.now() + 3600e3 })
    }
    if (!authed(req)) return json(res, 401, { error: 'not accepted', code: 'BR-LIB-002' })
    if (u.pathname === '/api/worker/reconcile') { flags.reconciles++; return json(res, 200, { ok: true, at: Date.now() }) }
    if (u.pathname === '/api/worker/enqueue') {
      const b = JSON.parse(String(await body(req)) || '{}')
      if (b.type !== 'library.scan') return json(res, 400, { error: 'scan only' })
      if ([...store.entries()].some(([k, d]) => k.startsWith('workerJobs/') && d.type === 'library.scan' && ['queued', 'running'].includes(d.status))) return json(res, 409, { error: 'busy', code: 'BR-LIB-005' })
      const id = `scan${Date.now()}`
      adminSet(`workerJobs/${id}`, { type: 'library.scan', params: {}, status: 'queued', createdBy: 'studio-worker', createdAt: new Timestamp(Date.now()), progress: { done: 0, total: 0, note: '' }, error: null })
      return json(res, 200, { id })
    }
    if (u.pathname === '/api/worker/changes' && req.method === 'GET') {
      const jobId = u.searchParams.get('jobId')
      const items = [...store.entries()].filter(([k, d]) => k.startsWith('libraryChanges/') && (!jobId || d.jobId === jobId))
        .map(([k, d]) => ({ id: k.split('/')[1], ...d, at: d.at.toMillis() })).sort((a, b) => b.at - a.at)
      return json(res, 200, { items, next: null })
    }
    if (u.pathname === '/api/worker/changes') {
      const b = JSON.parse(String(await body(req)))
      const job = store.get(`workerJobs/${b.jobId}`)
      if (!job) return json(res, 404, { error: 'no job' })
      for (const c of b.changes) {
        const why = changeRefusal({ type: job.type, status: job.status }, c, store.get(`workerProposals/${c.songId}`)?.status)
        if (why) return json(res, 409, { error: why, code: 'BR-LIB-011' })
        if (c.undoOf && store.has(`libraryChanges/${undoRecordId(c.undoOf)}`)) return json(res, 409, { error: 'already undone' })
      }
      for (const c of b.changes) {
        const id = c.undoOf ? undoRecordId(c.undoOf) : `ch${Date.now()}${Math.random().toString(36).slice(2, 7)}`
        adminSet(`libraryChanges/${id}`, { ...c, by: 'studio-worker', at: new Timestamp(Date.now()), jobId: b.jobId })
        events.push({ t: Date.now(), kind: 'record', songId: String(c.songId), field: c.field })
        if (c.field === 'beat') adminSet(`libraryBeats/${beatKey(c.artist, c.title)}`, { value: c.new })
      }
      return json(res, 200, { recorded: b.changes.length })
    }
    json(res, 404, { error: 'not found' })
  }).listen(port, '127.0.0.1')
}

// ── AzuraCast ──
function wav(seconds, bpm, amp) {
  const sr = 22050, n = sr * seconds, data = Buffer.alloc(n * 2), period = Math.round(sr * 60 / bpm)
  for (let i = 0; i < n; i++) {
    const k = i % period
    const click = k < 600 ? Math.sin(2 * Math.PI * 1000 * i / sr) * Math.exp(-k / 120) : 0
    const v = amp * (0.25 * Math.sin(2 * Math.PI * 110 * i / sr) + 0.75 * click)
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2)
  }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
export const media = new Map([
  ['1', { id: 1, unique_id: 'u1', path: 'drake.mp3', title: 'Hotline Bling (Official Video)', artist: 'Drake', album: '', amplify: null, art_updated_at: 0, audio: wav(20, 120, 0.9) }],
  ['2', { id: 2, unique_id: 'u2', path: 'ivy.mp3', title: 'Frank Ocean - Ivy', artist: '', album: 'Blonde', amplify: null, art_updated_at: 1700000000, audio: wav(20, 100, 0.2) }],
  ['3', { id: 3, unique_id: 'u3', path: 'mgmt.mp3', title: 'Electric Feel', artist: 'MGMT - Topic', album: '', amplify: null, art_updated_at: 0, audio: wav(20, 140, 0.5) }],
  ['4', { id: 4, unique_id: 'u4', path: 'redbone.mp3', title: 'Redbone', artist: 'Childish Gambino', album: 'Awaken, My Love!', amplify: null, art_updated_at: 0, audio: wav(20, 80, 0.5) }],
])
const art = new Map([['2', Buffer.from('old-ivy-cover')]])
// Media tags persist between test phases (the audio is made again each time).
import { existsSync as _ex, readFileSync as _rd, writeFileSync as _wr } from 'node:fs'
const MEDIA_FILE = process.env.FAKE_MEDIA_FILE
if (MEDIA_FILE && _ex(MEDIA_FILE)) for (const [id, v] of Object.entries(JSON.parse(_rd(MEDIA_FILE, 'utf8')))) Object.assign(media.get(id), v)
export const saveMedia = () => { if (MEDIA_FILE) _wr(MEDIA_FILE, JSON.stringify(Object.fromEntries([...media].map(([k, { audio, ...v }]) => [k, v])))) }
export const azCalls = []
const pub = m => { const { audio, ...rest } = m; return { ...rest, art: `http://127.0.0.1:8090/api/station/babson_radio/art/${m.unique_id}`, links: { download: `http://127.0.0.1:8090/api/station/babson_radio/file/${m.id}/play` } } }

export function startAzura(port, key) {
  return createServer(async (req, res) => {
    azCalls.push({ t: Date.now(), m: req.method, p: req.url })
    if (req.headers['x-api-key'] !== key) return json(res, 403, { error: 'bad key' })
    const u = new URL(req.url, 'http://x'), p = u.pathname
    let m
    if (p === '/api/station/babson_radio/files') return json(res, 200, [...media.values()].map(pub))
    if ((m = /^\/api\/station\/babson_radio\/file\/(\d+)\/play$/.exec(p))) { res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(media.get(m[1]).audio) }
    if ((m = /^\/api\/station\/babson_radio\/file\/(\d+)$/.exec(p))) {
      const s = media.get(m[1]); if (!s) return json(res, 404, {})
      if (req.method === 'GET') return json(res, 200, pub(s))
      if (req.method === 'PUT') {
        if (flags.fail429 > 0) { flags.fail429--; res.writeHead(429, { 'retry-after': '1' }); return res.end('{}') }
        const b = JSON.parse(String(await body(req)))
        for (const f of ['title', 'artist', 'album', 'amplify']) if (f in b) { s[f] = b[f]; events.push({ t: Date.now(), kind: 'azwrite', songId: m[1], field: f }) }
        saveMedia()
        return json(res, 200, { success: true })
      }
    }
    if ((m = /^\/api\/station\/babson_radio\/art\/([\w-]+)$/.exec(p))) {
      const sid = [...media.values()].find(x => x.unique_id === m[1] || String(x.id) === m[1])?.id
      if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(art.get(String(sid)) || Buffer.from('default')) }
      if (req.method === 'POST') { art.set(String(sid), await body(req)); media.get(String(sid)).art_updated_at = Date.now(); events.push({ t: Date.now(), kind: 'azwrite', songId: String(sid), field: 'art' }); return json(res, 200, {}) }
      if (req.method === 'DELETE') { art.delete(String(sid)); media.get(String(sid)).art_updated_at = 0; events.push({ t: Date.now(), kind: 'azwrite', songId: String(sid), field: 'art' }); return json(res, 200, {}) }
    }
    json(res, 404, { error: 'nope' })
  }).listen(port, '127.0.0.1')
}

export function startHelper(port, origin) {
  return createServer((req, res) => {
    if (req.headers.origin !== origin) return json(res, 403, { error: 'Not allowed.' })
    json(res, 200, { connected: flags.helperLive, connecting: false })
  }).listen(port, '127.0.0.1')
}
