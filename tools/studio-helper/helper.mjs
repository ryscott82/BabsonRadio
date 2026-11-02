// Babson Radio studio helper. Runs on the studio PC next to BUTT and lets the kiosk page (babsonradio.com/booth) drive it.
// Plain Node 18+, no packages. Start: node helper.mjs   (settings in .env next to this file, see .env.example)
//
// It only listens on 127.0.0.1, only answers the website's origin, and only obeys a control token the website signed with
// STUDIO_PC_SECRET after checking the person may go live. The format matches babsonsound-web/lib/booth.ts.

import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = join(here, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const SECRET = process.env.STUDIO_PC_SECRET ?? ''
const PORT = Number(process.env.HELPER_PORT || 7781)
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://babsonradio.com,https://www.babsonradio.com').split(',').map(s => s.trim()).filter(Boolean)
const BUTT = process.env.BUTT_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\butt\\butt.exe' : 'butt')
const BUTT_PORT = String(process.env.BUTT_COMMAND_PORT || 1256)
const BUTT_SERVER = process.env.BUTT_SERVER_NAME || '' // name of the saved server in BUTT to connect to ('' = BUTT's default)
// Every show is recorded in BUTT (to BUTT's recording folder) unless RECORD_SHOWS=0.
const RECORD = process.env.RECORD_SHOWS !== '0'
// Station music library (background music for talk shows). A limited AzuraCast API key: a user with only "Manage station media".
const AZ_URL = (process.env.AZURACAST_URL || '').replace(/\/+$/, '')
const AZ_KEY = process.env.AZURACAST_API_KEY || ''
const AZ_STATION = encodeURIComponent(process.env.AZURACAST_STATION_ID || '1')
const list = v => v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
const BED_LISTS = list(process.env.BED_PLAYLISTS || 'Beds,Podcast beds,Background')
const ID_LISTS = list(process.env.ID_PLAYLISTS || 'Station IDs,Sweepers')
const PAD_LISTS = list(process.env.SOUNDBOARD_PLAYLISTS || 'Soundboard,Jingles,Sound effects')
const AD_LISTS = list(process.env.AD_PLAYLISTS || 'Ads,Advertisements,PSAs')

// Auto level: BUTT's Master Gain can be moved by a MIDI CC (BUTT: Settings → MIDI). The helper sends that CC through a
// virtual MIDI cable (loopMIDI on Windows). Optional: without it, the page just shows the level.
const MIDI_PORT = (process.env.MIDI_PORT || 'loopMIDI').toLowerCase()
const MIDI_CHANNEL = Math.min(16, Math.max(1, Number(process.env.MIDI_CHANNEL) || 1))
const MIDI_GAIN_CC = Math.min(127, Math.max(0, Number(process.env.MIDI_GAIN_CC) || 7))
let midiOut = null, midiError = '', gainDb = 0
function midi() {
  if (midiOut) return midiOut
  try {
    const { Output } = createRequire(import.meta.url)('@julusian/midi')
    const out = new Output()
    for (let i = 0; i < out.getPortCount(); i++) {
      if (out.getPortName(i).toLowerCase().includes(MIDI_PORT)) { out.openPort(i); midiOut = out; midiError = ''; return out }
    }
    midiError = `No MIDI port named "${MIDI_PORT}". Open loopMIDI.`
  } catch { midiError = 'Auto level needs the MIDI add-on (run "npm install" in the helper folder).' }
  return null
}
/** BUTT maps CC 0..127 linearly onto -24..+24 dB of Master Gain. */
const gainToCc = db => Math.round(((Math.max(-24, Math.min(24, db)) + 24) / 48) * 127)
function setGain(db) {
  const out = midi()
  if (!out) throw new Error(midiError)
  out.sendMessage([0xB0 | (MIDI_CHANNEL - 1), MIDI_GAIN_CC, gainToCc(db)])
  gainDb = Math.round(Math.max(-24, Math.min(24, db)) * 10) / 10
  return gainDb
}

if (SECRET.length < 24) { console.error('Set STUDIO_PC_SECRET in .env (same value as on the website, 32+ characters).'); process.exit(1) }

// ── tokens (same as lib/booth.ts) ─────────────────────────────
const mac = msg => createHmac('sha256', SECRET).update(msg).digest()
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b)

function verifyToken(token) {
  const [body, sig, extra] = String(token || '').split('.')
  if (!body || !sig || extra !== undefined) return null
  if (!same(Buffer.from(sig, 'base64url'), mac(`ctl:${body}`))) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString())
    return typeof c.exp === 'number' && c.exp > Date.now() && typeof c.u === 'string' ? c : null
  } catch { return null }
}

// ── BUTT (its own command line talks to the running BUTT on its command port) ──
function butt(args) {
  return new Promise((resolve, reject) => {
    execFile(BUTT, ['-p', BUTT_PORT, ...args], { timeout: 6000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`BUTT did not answer (${(stderr || err.message).toString().trim().slice(0, 160)})`))
      else resolve(String(stdout))
    })
  })
}

async function status() {
  const out = await butt(['-S'])
  if (!/^connected:/mi.test(out)) throw new Error('BUTT gave no status. Is BUTT open, with its command server on?')
  const num = k => { const m = new RegExp(`^${k}:\\s*(-?[\\d.]+)`, 'mi').exec(out); return m ? Number(m[1]) : 0 }
  const txt = k => { const m = new RegExp(`^${k}:\\s?(.*)$`, 'mi').exec(out); return m ? m[1].trim() : '' }
  return {
    connected: num('connected') === 1, connecting: num('connecting') === 1, recording: num('recording') === 1,
    signal: num('signal present') === 1, silence: num('signal absent') === 1,
    streamSeconds: num('stream seconds'), volumeLeft: num('volume left'), volumeRight: num('volume right'), song: txt('song'),
  }
}

// One command at a time, so a double-tap can't send connect twice.
let queue = Promise.resolve()
const serial = fn => (queue = queue.then(fn, fn))

const log = (...a) => console.log(new Date().toLocaleString(), ...a)

// ── Station music library (AzuraCast) ───────────────────────
let lib = { at: 0, rows: [] }
async function library() {
  if (!AZ_URL || !AZ_KEY) throw new Error('The music library is not set up on this PC (AZURACAST_URL and AZURACAST_API_KEY in .env).')
  if (Date.now() - lib.at < 10 * 60_000 && lib.rows.length) return lib.rows
  const res = await fetch(`${AZ_URL}/api/station/${AZ_STATION}/files`, { headers: { 'X-API-Key': AZ_KEY }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`The station library answered ${res.status}.`)
  const raw = await res.json()
  const rows = (Array.isArray(raw) ? raw : raw.rows ?? []).map(m => {
    const pls = (m.playlists ?? []).map(p => String(p.name ?? '')).filter(Boolean)
    const low = pls.map(p => p.toLowerCase())
    return {
      id: String(m.unique_id || m.id), title: m.title || m.text || m.path?.split('/').pop() || 'Untitled', artist: m.artist || '',
      length: Number(m.length) || 0, playlists: pls,
      bed: low.some(p => BED_LISTS.includes(p)), stationId: low.some(p => ID_LISTS.includes(p)),
      pad: low.some(p => PAD_LISTS.includes(p)), ad: low.some(p => AD_LISTS.includes(p)),
    }
  })
  lib = { at: Date.now(), rows }
  return rows
}

function searchLibrary(rows, q, kind) {
  const pick = { beds: x => x.bed, ids: x => x.stationId, pads: x => x.pad || x.stationId, ads: x => x.ad, all: x => !x.stationId && !x.pad && !x.ad }
  let r = rows.filter(pick[kind] ?? pick.all)
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length) r = r.filter(x => { const t = `${x.title} ${x.artist} ${x.playlists.join(' ')}`.toLowerCase(); return words.every(w => t.includes(w)) })
  return r.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 80)
}

/** Streams one file from AzuraCast to the page, passing Range through so the page can seek. */
async function streamTrack(id, req, res, origin) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return send(res, 400, { error: 'Bad track.' }, origin)
  const headers = { 'X-API-Key': AZ_KEY }
  if (req.headers.range) headers.Range = req.headers.range
  const up = await fetch(`${AZ_URL}/api/station/${AZ_STATION}/file/${id}/play`, { headers, signal: AbortSignal.timeout(30_000) })
  if (!up.ok && up.status !== 206) return send(res, 502, { error: `The station library answered ${up.status}.` }, origin)
  const h = { 'access-control-allow-origin': origin, vary: 'Origin', 'cache-control': 'no-store', 'accept-ranges': 'bytes' }
  for (const k of ['content-type', 'content-length', 'content-range']) { const v = up.headers.get(k); if (v) h[k] = v }
  res.writeHead(up.status, h)
  const reader = up.body.getReader()
  req.on('close', () => reader.cancel().catch(() => {}))
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!res.write(value)) await new Promise(r => res.once('drain', r))
  }
  res.end()
}

// ── HTTP ──────────────────────────────────────────────────────
function send(res, code, body, origin) {
  const h = { 'content-type': 'application/json', 'cache-control': 'no-store' }
  if (origin) { h['access-control-allow-origin'] = origin; h.vary = 'Origin' }
  res.writeHead(code, h)
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let s = ''
    req.on('data', c => { s += c; if (s.length > 4096) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')) } catch { resolve({}) } })
  })
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || ''
  const allowed = ORIGINS.includes(origin) || (process.env.ALLOW_LOCALHOST === '1' && /^http:\/\/localhost:\d+$/.test(origin))
  if (!allowed) return send(res, 403, { error: 'Not allowed.' })

  // Chrome asks before a public site may reach 127.0.0.1 (Private Network Access preflight).
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': origin, vary: 'Origin',
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type, range',
      'access-control-allow-private-network': 'true',
      'access-control-max-age': '600',
    })
    return res.end()
  }

  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && url.pathname === '/ping') return send(res, 200, { ok: true, version: 1 }, origin)

    // Proves to the website that this sign-in is happening on the studio PC.
    if (req.method === 'GET' && url.pathname === '/attest') {
      const nonce = url.searchParams.get('nonce') || ''
      if (!/^\d{12,14}\.[A-Za-z0-9]{8,64}$/.test(nonce)) return send(res, 400, { error: 'Bad nonce.' }, origin)
      return send(res, 200, { sig: mac(`attest:${nonce}`).toString('hex') }, origin)
    }

    if (req.method === 'GET' && url.pathname === '/status') return send(res, 200, await status(), origin)
    if (req.method === 'GET' && url.pathname === '/gain') return send(res, 200, { available: !!midi(), db: gainDb, error: midiError }, origin)

    const track = /^\/library\/play\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'GET' && track) {
      if (!verifyToken(url.searchParams.get('token'))) return send(res, 401, { error: 'Sign in again on the studio PC.', code: 'BR-BTH-002' }, origin)
      return await streamTrack(track[1], req, res, origin)
    }

    if (req.method !== 'POST') return send(res, 404, { error: 'Not found.' }, origin)
    const b = await readBody(req)
    const c = verifyToken(b.token)
    if (!c) return send(res, 401, { error: 'Sign in again on the studio PC.', code: 'BR-BTH-002' }, origin)

    if (url.pathname === '/gain') {
      const db = Number(b.db)
      if (!Number.isFinite(db)) return send(res, 400, { error: 'Bad gain.' }, origin)
      return send(res, 200, { db: setGain(db) }, origin)
    }
    if (url.pathname === '/library') {
      const kind = ['beds', 'ids', 'pads', 'ads', 'all'].includes(b.kind) ? b.kind : 'all'
      const rows = await library()
      return send(res, 200, { tracks: searchLibrary(rows, b.q, kind), total: rows.length }, origin)
    }
    if (url.pathname === '/live/start') {
      if (!c.l) return send(res, 403, { error: "You can't go live right now." }, origin)
      const st = await serial(async () => {
        const now = await status()
        if (!now.connected && !now.connecting) await butt(BUTT_SERVER ? ['-s', BUTT_SERVER] : ['-s'])
        if (RECORD && !now.recording) await butt(['-r']).catch(() => {})
        return status()
      })
      log(`LIVE START  ${c.n} (${c.u})`)
      return send(res, 200, st, origin)
    }
    if (url.pathname === '/live/stop') {
      const st = await serial(async () => {
        await butt(['-d'])
        if (RECORD) await butt(['-t']).catch(() => {})
        return status()
      })
      log(`LIVE STOP   ${c.n} (${c.u})`)
      return send(res, 200, st, origin)
    }
    if (url.pathname === '/song') {
      if (!c.l) return send(res, 403, { error: "You can't send songs right now." }, origin)
      const text = String(b.text || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200)
      if (!text) return send(res, 400, { error: 'Type a song.' }, origin)
      await serial(() => butt(['-u', text]))
      log(`SONG        ${c.n}: ${text}`)
      return send(res, 200, { ok: true }, origin)
    }
    return send(res, 404, { error: 'Not found.' }, origin)
  } catch (e) {
    log('ERROR', e.message)
    return send(res, 502, { error: e.message }, origin)
  }
})

server.listen(PORT, '127.0.0.1', () => log(`Studio helper on http://127.0.0.1:${PORT} for ${ORIGINS.join(', ')}. BUTT: ${BUTT}`))
