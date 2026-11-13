// Babson Radio studio helper. Runs on the studio PC next to BUTT and lets the kiosk page (babsonradio.com/booth) drive it.
// Plain Node 18+, no packages. Start: node helper.mjs   (settings in .env next to this file, see .env.example)
//
// It only listens on 127.0.0.1, only answers the website's origin, and only obeys a control token the website signed with
// STUDIO_PC_SECRET after checking the person may go live. The format matches babsonsound-web/lib/booth.ts.

import { createServer } from 'node:http'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { copyFileSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRecorder, newId } from './lib/recorder.mjs'
import { createUploads } from './lib/uploads.mjs'
import { createLiveArchive } from './lib/livearchive.mjs'
import { normalizeOne } from './lib/normalize.mjs'
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

// Record a show: takes are kept in RECORDINGS_DIR until the upload is confirmed (then 7 more days). Uploads go straight to AzuraCast with the
// key above (it needs "Manage station media"), into UPLOAD_FOLDER, then the website is told (SITE_URL). See README "Record a show".
const SITE_URL = (process.env.SITE_URL || 'https://babsonradio.com').replace(/\/+$/, '')
const REC_DIR = process.env.RECORDINGS_DIR || join(here, 'recordings')
const UPLOAD_FOLDER = process.env.UPLOAD_FOLDER || 'Student recordings'
const UPLOAD_WHILE_LIVE = process.env.UPLOAD_WHILE_LIVE === '1'
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
// Optional: even out each recording's loudness after it is uploaded, with the PC worker's tool (needs Python and tools/normalize_loudness.py).
const NORMALIZE = process.env.NORMALIZE_RECORDINGS === '1'
const TOOLS_DIR = process.env.TOOLS_DIR || join(here, '..')

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

/** The website's signature on a title that passed its word filter (same as cleanSig in babsonsound-web/lib/booth.ts). */
function cleanOk(text, sig) {
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false
  return same(Buffer.from(sig, 'hex'), mac(`clean:${text}`))
}

// ── BUTT (its own command line talks to the running BUTT on its command port) ──
let statusShared = { at: 0, p: null }
function butt(args) {
  if (args[0] !== '-S') statusShared = { at: 0, p: null } // a command changes BUTT's state: the next status is read fresh
  return new Promise((resolve, reject) => {
    execFile(BUTT, ['-p', BUTT_PORT, ...args], { timeout: 6000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`BUTT did not answer (${(String(stderr || '').trim() || String(stdout || '').trim() || err.message).slice(0, 160)})`))
      else resolve(String(stdout))
    })
  })
}

// BUTT 1.47 answers at most one status request per second ("You may only request one status packet per second"). The page asks every
// 2 seconds and the recorder and upload queue ask too, so: everyone in the same second shares one answer, and a refused request is
// tried again a second later instead of showing "BUTT isn't answering".
function status() {
  const now = Date.now()
  if (statusShared.p && now - statusShared.at < 1100) return statusShared.p
  const p = readStatus()
  statusShared = { at: now, p }
  p.catch(() => { if (statusShared.p === p) statusShared = { at: 0, p: null } })
  return p
}
async function readStatus() {
  for (let i = 0; ; i++) {
    try { return parseStatus(await butt(['-S'])) } catch (e) {
      if (i >= 2 || !/one status packet/i.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 1100))
    }
  }
}
function parseStatus(out) {
  if (!/^connected:/mi.test(out)) throw new Error('BUTT gave no status. Is BUTT open, with its command server on?')
  const num = k => { const m = new RegExp(`^${k}:\\s*(-?[\\d.]+)`, 'mi').exec(out); return m ? Number(m[1]) : 0 }
  const txt = k => { const m = new RegExp(`^${k}:\\s?(.*)$`, 'mi').exec(out); return m ? m[1].trim() : '' }
  return {
    connected: num('connected') === 1, connecting: num('connecting') === 1, recording: num('recording') === 1,
    signal: num('signal present') === 1, silence: num('signal absent') === 1,
    streamSeconds: num('stream seconds'), volumeLeft: num('volume left'), volumeRight: num('volume right'), song: txt('song'),
    recordSeconds: num('record seconds'), recordPath: txt('record path'),
  }
}
/** Is a show going out from this PC? If BUTT doesn't answer, nothing is streaming from here. */
const isLive = () => status().then(s => s.connected || s.connecting, () => false)

// One command at a time, so a double-tap can't send connect twice.
let queue = Promise.resolve()
const serial = fn => (queue = queue.then(fn, fn))

const log = (...a) => console.log(new Date().toLocaleString(), ...a)

// ── Record a show ─────────────────────────────────────────────
mkdirSync(REC_DIR, { recursive: true })
const jsonStore = file => ({
  load: () => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } },
  save: v => { writeFileSync(`${file}.tmp`, JSON.stringify(v, null, 1)); renameSync(`${file}.tmp`, file) },
})
function moveFile(src, dst) {
  try { renameSync(src, dst) } catch (e) {
    if (e.code !== 'EXDEV') throw e
    copyFileSync(src, dst); unlinkSync(src) // BUTT's folder is on another drive
  }
}
const run = (cmd, args, ms = 10 * 60_000) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: ms, windowsHide: true, maxBuffer: 4 << 20 }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err.message).trim().slice(-300))) : resolve(String(out))))
})
const recorder = createRecorder({
  butt, status, dir: REC_DIR, now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)), log,
  store: jsonStore(join(REC_DIR, 'recorder.json')),
  files: {
    mkdir: d => mkdirSync(d, { recursive: true }), move: async (a, b) => moveFile(a, b), exists: existsSync,
    removeDir: d => rmSync(d, { recursive: true, force: true }), join, ext: f => extname(f).toLowerCase(),
  },
  // Join the pieces without re-encoding (they all come from the same BUTT settings).
  concat: async (files, out) => {
    const listFile = `${out}.txt`
    writeFileSync(listFile, files.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
    try { await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]) }
    catch (e) { throw new Error(`Could not join the recording (is ffmpeg installed?): ${e.message}`) }
    finally { rmSync(listFile, { force: true }) }
    for (const f of files) rmSync(f, { force: true })
  },
  probe: async f => Number((await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], 30_000)).trim()) || 0,
})

let normalizeDeps = null
async function normalize(item) {
  if (!normalizeDeps) {
    const { runTool } = await import(pathToFileURL(join(TOOLS_DIR, 'pc-worker', 'src', 'python.mjs')).href)
    normalizeDeps = {
      runTool, isLive, target: Number(process.env.TARGET_LUFS) || undefined,
      cfg: {
        python: process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'), toolsDir: TOOLS_DIR,
        azura: { url: AZ_URL, station: process.env.AZURACAST_STATION || decodeURIComponent(AZ_STATION), apiKey: AZ_KEY, minInterval: Number(process.env.AZ_MIN_INTERVAL) || 1 },
      },
    }
  }
  return normalizeOne(item.mediaId, normalizeDeps)
}

const uploads = createUploads({
  store: { load: () => jsonStore(join(REC_DIR, 'queue.json')).load() || [], save: v => jsonStore(join(REC_DIR, 'queue.json')).save(v) },
  fs: {
    size: f => statSync(f).size,
    read: async (f, start, end) => {
      const buf = Buffer.alloc(end - start), fd = openSync(f, 'r')
      try { readSync(fd, buf, 0, buf.length, start) } finally { closeSync(fd) }
      return buf
    },
    remove: f => { rmSync(f, { force: true }); rmSync(dirname(f), { recursive: true, force: true }) },
  },
  fetch: (...a) => fetch(...a), now: Date.now, log, isLive, uploadWhileLive: UPLOAD_WHILE_LIVE,
  az: { base: AZ_URL, key: AZ_KEY, station: AZ_STATION, dir: UPLOAD_FOLDER },
  // The website knows this is the studio PC by the same signed nonce the page uses to sign in.
  site: {
    url: SITE_URL,
    headers: () => {
      const nonce = `${Date.now()}.${randomBytes(12).toString('hex')}`
      return { 'x-booth-nonce': nonce, 'x-booth-sig': mac(`attest:${nonce}`).toString('hex') }
    },
  },
  normalize: NORMALIZE ? normalize : undefined,
})
// Work the queue every few seconds (one step at a time), and clear week-old finished files at start and every hour.
let pumping = false
async function pump() {
  if (pumping) return
  pumping = true
  try { while (await uploads.step()) { /* next */ } } catch (e) { log('UPLOAD ERROR', e.message) } finally { pumping = false }
}
setInterval(pump, 3000).unref?.()
setTimeout(() => { uploads.cleanup(); pump() }, 2000)
setInterval(() => uploads.cleanup(), 3_600_000).unref?.()

// Live shows: who is on air + the booth's "Show info", and the automatic archive of BUTT's recording when the show ends.
const ARCHIVE_LIVE = process.env.ARCHIVE_LIVE_SHOWS !== '0'
const liveArchive = createLiveArchive({
  store: jsonStore(join(REC_DIR, 'live.json')), dir: REC_DIR, now: Date.now, newId, sleep: ms => new Promise(r => setTimeout(r, ms)), log,
  minSec: Number(process.env.ARCHIVE_MIN_SECONDS ?? 60),
  files: { mkdir: d => mkdirSync(d, { recursive: true }), move: async (a, b) => moveFile(a, b), remove: f => rmSync(f, { force: true }), join, ext: f => extname(f).toLowerCase() },
  uploads: { add: t => { uploads.add(t); pump() } },
  probe: async f => Number((await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], 30_000)).trim()) || 0,
})
// A show that was on air when the PC or helper restarted: archive it once BUTT is no longer recording.
setTimeout(() => { if (ARCHIVE_LIVE) liveArchive.recover(() => status().then(s => s.recording)).then(r => r !== 'none' && log(`LIVE ARCHIVE recovered: ${r}`)).catch(() => {}) }, 5000)

const cleanTitle = v => String(v || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 80)
const cleanRef = v => (/^[A-Za-z0-9_-]{1,100}$/.test(String(v || '')) ? String(v) : '')

/** Plays a take back to the page (listen back before saving), with Range so the page can seek. */
function streamFile(file, req, res, origin) {
  const size = statSync(file).size
  const types = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac' }
  const h = { 'access-control-allow-origin': origin, vary: 'Origin', 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream' }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : size - 1
    start = Math.max(0, start); end = Math.min(size - 1, end)
    if (start > end) { res.writeHead(416, { ...h, 'content-range': `bytes */${size}` }); return res.end() }
    res.writeHead(206, { ...h, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { ...h, 'content-length': size })
  createReadStream(file).pipe(res)
}

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

    // "Exit booth panel": the studio PC watchdog (scripts/booth-watchdog.ps1) keeps the booth in front and reopens it. This file tells it to
    // stand down for 30 minutes, then the helper closes the booth window so the computer can be used normally. /exit-booth/cancel brings it back.
    if (req.method === 'POST' && url.pathname === '/exit-booth') {
      const flag = process.env.BOOTH_EXIT_FLAG || 'C:\\BabsonRadio\\booth-exit.flag'
      try { writeFileSync(flag, new Date().toISOString()) } catch (e) { return send(res, 500, { error: `Could not write ${flag}: ${e.message}` }, origin) }
      execFile('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*BabsonRadioKiosk*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { windowsHide: true }, () => {})
      log('EXIT BOOTH PANEL')
      return send(res, 200, { ok: true, minutes: 30 }, origin)
    }
    if (req.method === 'POST' && url.pathname === '/exit-booth/cancel') {
      try { unlinkSync(process.env.BOOTH_EXIT_FLAG || 'C:\\BabsonRadio\\booth-exit.flag') } catch { /* none */ }
      return send(res, 200, { ok: true }, origin)
    }

    if (req.method === 'GET' && url.pathname === '/status') return send(res, 200, await status(), origin)
    if (req.method === 'GET' && url.pathname === '/gain') return send(res, 200, { available: !!midi(), db: gainDb, error: midiError }, origin)

    // Record a show: what is going on, my unsaved takes and my uploads. Needs the person's token (their own things only).
    if (req.method === 'GET' && url.pathname === '/record/state') {
      const c = verifyToken(url.searchParams.get('token'))
      if (!c) return send(res, 401, { error: 'Sign in again on the studio PC.', code: 'BR-BTH-002' }, origin)
      const r = recorder.state()
      return send(res, 200, {
        canRecord: c.r === true, recorder: r.uid === c.u || r.state === 'idle' ? r : { state: r.state, name: r.name, elapsedSec: r.elapsedSec, id: '', uid: '' },
        takes: recorder.takesFor(c.u), uploads: uploads.list(c.u),
      }, origin)
    }
    const take = /^\/record\/file\/([A-Za-z0-9]{8,40})$/.exec(url.pathname)
    if (req.method === 'GET' && take) {
      const c = verifyToken(url.searchParams.get('token'))
      const t = c && recorder.take(take[1])
      if (!t || t.uid !== c.u || !existsSync(t.file)) return send(res, 404, { error: 'Recording not found.' }, origin)
      return streamFile(t.file, req, res, origin)
    }

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
      if (recorder.active()) return send(res, 409, { error: 'A recording is going. Stop it before going live.' }, origin)
      const st = await serial(async () => {
        const now = await status()
        if (!now.connected && !now.connecting) await butt(BUTT_SERVER ? ['-s', BUTT_SERVER] : ['-s'])
        if (RECORD && !now.recording) await butt(['-r']).catch(() => {})
        return status()
      })
      if (ARCHIVE_LIVE && RECORD) {
        // BUTT opens its file a moment after -r: ask where it is writing, so the archive knows even if BUTT is restarted later.
        liveArchive.begin({ uid: c.u, name: c.n, token: String(b.token || '') }, st.recordPath || '')
        if (!st.recordPath) setTimeout(() => status().then(s => liveArchive.setPiecePath(s.recordPath)).catch(() => {}), 1500)
      }
      log(`LIVE START  ${c.n} (${c.u})`)
      return send(res, 200, st, origin)
    }
    if (url.pathname === '/live/stop') {
      const st = await serial(async () => {
        const before = await status().catch(() => null) // BUTT's recording path, read before it stops
        await butt(['-d'])
        if (RECORD) await butt(['-t']).catch(() => {})
        if (ARCHIVE_LIVE && RECORD) await liveArchive.finish(before?.recordPath || '').catch(e => log('LIVE ARCHIVE ERROR', e.message))
        return status()
      })
      log(`LIVE STOP   ${c.n} (${c.u})`)
      return send(res, 200, st, origin)
    }
    // ── Record a show (BUTT's recorder only, no stream) ──
    if (url.pathname === '/record/start') {
      if (c.r !== true) return send(res, 403, { error: 'Finish studio training to record in the studio.' }, origin)
      return send(res, 200, await serial(() => recorder.start(c)), origin)
    }
    // Anyone signed in can pause or stop a recording, so nobody is stuck with one running (like ending the stream).
    if (url.pathname === '/record/pause') return send(res, 200, await serial(() => recorder.pause()), origin)
    if (url.pathname === '/record/resume') {
      if (c.r !== true || recorder.state().uid !== c.u) return send(res, 403, { error: 'Only the person who started this recording can resume it.' }, origin)
      return send(res, 200, await serial(() => recorder.resume()), origin)
    }
    if (url.pathname === '/record/stop') {
      const t = await serial(() => recorder.stop())
      return send(res, 200, { id: t.id, durationSec: t.durationSec, mine: t.uid === c.u }, origin)
    }
    if (url.pathname === '/record/save') {
      const t = recorder.take(String(b.id || ''))
      if (!t || t.uid !== c.u) return send(res, 404, { error: 'Recording not found.' }, origin)
      if (c.r !== true) return send(res, 403, { error: 'Finish studio training to record in the studio.' }, origin)
      const title = cleanTitle(b.title)
      if (!title) return send(res, 400, { error: 'Give the recording a title.' }, origin)
      const requestId = cleanRef(b.requestId)
      uploads.add({ ...t, title, token: b.token, bookingId: cleanRef(b.bookingId), requestId, cleanConfirmed: requestId ? b.cleanConfirmed === true : false })
      recorder.forget(t.id)
      log(`RECORD SAVE  ${c.n} ${t.id} "${title}"`)
      pump()
      return send(res, 200, { ok: true, uploads: uploads.list(c.u) }, origin)
    }
    if (url.pathname === '/record/discard') {
      const t = recorder.take(String(b.id || ''))
      if (!t || t.uid !== c.u) return send(res, 404, { error: 'Recording not found.' }, origin)
      recorder.discard(t.id)
      return send(res, 200, { ok: true }, origin)
    }
    if (url.pathname === '/uploads/retry') {
      const it = uploads.get(String(b.id || ''))
      if (!it || it.uid !== c.u) return send(res, 404, { error: 'Recording not found.' }, origin)
      uploads.retry(it.id)
      pump()
      return send(res, 200, { ok: true, uploads: uploads.list(c.u) }, origin)
    }

    // Show info (title, contributors, description, category): anyone signed in can read and change it, before or during a show.
    if (url.pathname === '/show/get') return send(res, 200, liveArchive.show(), origin)
    if (url.pathname === '/show/set') {
      if (!c.l && c.r !== true) return send(res, 403, { error: "You can't edit the show info right now." }, origin)
      const out = liveArchive.setShow(b)
      log(`SHOW INFO   ${c.n}: "${out.title}"`)
      return send(res, 200, out, origin)
    }

    if (url.pathname === '/song') {
      if (!c.l) return send(res, 403, { error: "You can't send songs right now." }, origin)
      const text = String(b.text || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200)
      if (!text) return send(res, 400, { error: 'Type a song.' }, origin)
      // Only text the website checked against the word filter goes out on the stream (it signs it: /api/booth/clean, lib/booth.ts cleanSig).
      if (!cleanOk(text, b.cleanSig)) return send(res, 400, { error: 'That track title wasn’t checked, so it wasn’t sent.', code: 'BR-HST-004' }, origin)
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

server.listen(PORT, '127.0.0.1', () => log(`Studio helper on http://127.0.0.1:${PORT} for ${ORIGINS.join(', ')}. BUTT: ${BUTT}. Recordings: ${REC_DIR}${NORMALIZE ? ' (loudness on)' : ''}`))
