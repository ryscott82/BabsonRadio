// The real helper.mjs over HTTP, with a pretend BUTT, ffmpeg, AzuraCast and website. Covers the routes and the whole save -> upload -> website flow.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeAzura } from './fakes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SECRET = 'test-secret-test-secret-test-secret-1234'
const ORIGIN = 'http://localhost:3000'
const mac = m => createHmac('sha256', SECRET).update(m).digest()
const token = (c) => { const body = Buffer.from(JSON.stringify({ s: 'sess', l: false, exp: Date.now() + 900_000, ...c })).toString('base64url'); return `${body}.${mac(`ctl:${body}`).toString('base64url')}` }
const listen = h => new Promise(r => { const s = createServer(h).listen(0, '127.0.0.1', () => r(s)) })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const az = fakeAzura()
const site = { recs: new Map(), badSig: 0, down: false }
const procs = [], servers = []
after(() => { procs.forEach(p => p.kill()); servers.forEach(s => s.close()) })

async function start() {
  const azSrv = await listen(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c)
    const url = `http://x${req.url}`
    const init = { method: req.method }
    if (req.method === 'POST') init.body = req.headers['content-type']?.startsWith('multipart') ? await new Request(url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData() : Buffer.concat(chunks).toString()
    const r = await az.fetch(url, init)
    res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(r.status === 204 ? undefined : await r.text())
  })
  const siteSrv = await listen(async (req, res) => {
    let s = ''; for await (const c of req) s += c
    const nonce = req.headers['x-booth-nonce'], sig = req.headers['x-booth-sig']
    const ok = nonce && sig === mac(`attest:${nonce}`).toString('hex') && Math.abs(Date.now() - Number(nonce.split('.')[0])) < 120_000
    if (site.down) { res.writeHead(503); return res.end('{}') }
    if (!ok) { site.badSig++; res.writeHead(403); return res.end('{"error":"bad sig"}') }
    const b = JSON.parse(s)
    if (req.url === '/api/booth/recordings/start') site.recs.set(b.id, { ...b, status: 'recording' })
    if (req.url === '/api/booth/recordings/complete') Object.assign(site.recs.get(b.id), { status: 'uploaded', path: b.azuracastPath, dur: b.durationSec })
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: b.id, ok: true }))
  })
  servers.push(azSrv, siteSrv)
  const dir = mkdtempSync(join(tmpdir(), 'helper-http-'))
  const port = 17000 + Math.floor(Math.random() * 2000)
  const p = spawn(process.execPath, [join(here, '..', 'helper.mjs')], {
    env: {
      ...process.env, STUDIO_PC_SECRET: SECRET, HELPER_PORT: String(port), ALLOW_LOCALHOST: '1', BUTT_PATH: join(here, 'fake-butt.mjs'),
      FAKE_BUTT_STATE: join(dir, 'butt.json'), FAKE_BUTT_DIR: dir, FAKE_BUTT_RATELIMIT: '1', RECORDINGS_DIR: join(dir, 'recordings'),
      FFMPEG_PATH: join(here, 'fake-ffmpeg.mjs'), FFPROBE_PATH: join(here, 'fake-ffmpeg.mjs'),
      AZURACAST_URL: `http://127.0.0.1:${azSrv.address().port}`, AZURACAST_API_KEY: 'k', AZURACAST_STATION_ID: 'babson_radio',
      SITE_URL: `http://127.0.0.1:${siteSrv.address().port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  procs.push(p)
  let out = ''; p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
  for (let i = 0; i < 50 && !out.includes('Studio helper on'); i++) await sleep(100)
  assert.match(out, /Studio helper on/, out)
  const base = `http://127.0.0.1:${port}`
  const call = async (path, body) => {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json().catch(() => null), r }
  }
  return { call, base, log: () => out }
}

const skip = process.platform === 'win32' ? 'the pretend BUTT is a script, which Windows cannot run directly' : false
test('record, pause, resume, stop, listen back, save, upload to AzuraCast, tell the website', { skip }, async () => {
  const h = await start()
  const me = token({ u: 'u1', n: 'Sam Lee', r: true }), noBadge = token({ u: 'u2', n: 'Al', r: false })

  assert.equal((await h.call('/record/start', { token: noBadge })).status, 403)
  let r = await h.call('/record/start', { token: me })
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.state, 'recording')
  assert.equal((await h.call('/live/start', { token: token({ u: 'u1', n: 'Sam', l: true, r: true }) })).status, 409, 'no go-live while recording')
  assert.equal((await h.call('/record/pause', { token: me })).body.state, 'paused')
  assert.equal((await h.call('/record/resume', { token: noBadge })).status, 403, 'only the recorder resumes')
  assert.equal((await h.call('/record/resume', { token: me })).body.state, 'recording')
  r = await h.call('/record/stop', { token: me })
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.durationSec, 13) // ffprobe said 12.5
  const id = r.body.id

  r = await h.call(`/record/state?token=${encodeURIComponent(me)}`)
  assert.equal(r.body.recorder.state, 'idle'); assert.deepEqual(r.body.takes.map(t => t.id), [id]); assert.equal(r.body.canRecord, true)
  assert.deepEqual((await h.call(`/record/state?token=${encodeURIComponent(noBadge)}`)).body.takes, [], 'nobody else sees it')

  const lb = await fetch(`${h.base}/record/file/${id}?token=${encodeURIComponent(me)}`, { headers: { origin: ORIGIN, range: 'bytes=0-99' } })
  assert.equal(lb.status, 206); assert.equal((await lb.arrayBuffer()).byteLength, 100); assert.equal(lb.headers.get('content-range'), 'bytes 0-99/6000000')
  assert.equal((await fetch(`${h.base}/record/file/${id}?token=${encodeURIComponent(noBadge)}`, { headers: { origin: ORIGIN } })).status, 404)

  assert.equal((await h.call('/record/save', { token: me, id, title: '' })).status, 400)
  r = await h.call('/record/save', { token: me, id, title: 'Late Night Talk' })
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.uploads[0].phase !== 'failed', true)

  let up
  for (let i = 0; i < 60; i++) { up = (await h.call(`/record/state?token=${encodeURIComponent(me)}`)).body.uploads[0]; if (up.phase === 'uploaded') break; await sleep(250) }
  assert.equal(up.phase, 'uploaded', JSON.stringify(up) + h.log())
  const path = [...az.files.keys()][0]
  assert.match(path, /^Student recordings\/\d{4}-\d\d-\d\d_\d{4}_late_night_talk_[a-z0-9]{6}\.mp3$/)
  assert.equal(az.files.get(path).length, 6_000_000, 'both pieces joined')
  assert.equal(site.badSig, 0)
  assert.deepEqual({ status: site.recs.get(id).status, path: site.recs.get(id).path, dur: site.recs.get(id).dur, title: site.recs.get(id).title, token: site.recs.get(id).token === me },
    { status: 'uploaded', path, dur: 13, title: 'Late Night Talk', token: true })
})

test('BUTT answers one status request a second: callers in the same second share it, a refused one is retried', { skip }, async () => {
  const h = await start()
  const all = await Promise.all(Array.from({ length: 5 }, () => h.call('/status')))
  assert.deepEqual(all.map(r => r.status), [200, 200, 200, 200, 200], JSON.stringify(all.map(r => r.body)))
  await sleep(300)
  const later = await h.call('/status') // inside BUTT's one second, past the shared answer? still fine
  assert.equal(later.status, 200, JSON.stringify(later.body))
  for (let i = 0; i < 4; i++) { assert.equal((await h.call('/status')).status, 200); await sleep(600) }
})

test('refuses other origins and bad tokens', { skip }, async () => {
  const h = await start()
  const r = await fetch(`${h.base}/ping`, { headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
  assert.equal((await h.call('/record/start', { token: 'x.y' })).status, 401)
  assert.equal((await h.call('/record/state?token=nope')).status, 401)
})
