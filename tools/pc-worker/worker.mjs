#!/usr/bin/env node
// Babson Radio studio PC worker. Picks up library jobs from Firestore (workerJobs, status "queued") one at a time and runs the
// Python tools in tools/ for them, at low priority, pausing whenever a live show is on air. Install: README.md in this folder.
//   node worker.mjs            run as a service
//   node worker.mjs --check    check settings, sign-in, Python, ffmpeg and the studio helper, then exit

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { configProblems, loadEnv, readConfig } from './src/env.mjs'
import { addSecret, initLog, log } from './src/log.mjs'
import { makeSite } from './src/site.mjs'
import { makeFirebase } from './src/firebase.mjs'
import { makeLive } from './src/live.mjs'
import { makeProposals } from './src/proposals.mjs'
import { makeAzura } from './src/azura.mjs'
import { RUNNERS, stateFiles, touchesLibrary } from './src/jobs.mjs'
import { cleanJobParams, isJobType } from './src/rules.mjs'

loadEnv()
const cfg = readConfig()
initLog(cfg.logDir)
addSecret(cfg.azura.apiKey)
mkdirSync(cfg.stateDir, { recursive: true })

const problems = configProblems(cfg)
if (problems.length) { for (const p of problems) log.error(p); process.exit(1) }

let fb
const site = makeSite(cfg, () => (fb ? fb.idToken() : Promise.resolve('')))
fb = makeFirebase(cfg, site)
const live = makeLive(cfg, site)
const proposals = makeProposals(fb.db)
const azura = makeAzura(cfg)

const queue = new Map()          // queued job id -> createdAt (ms)
let current = null               // the running job's context
let liveNow = false, pausedForShow = false, stopping = false

// ── heartbeat: every 5 minutes, and at each job start and end ──
async function heartbeat() {
  try {
    await setDoc(doc(fb.db, 'workerStatus', 'pc'), {
      lastSeen: serverTimestamp(), version: cfg.version, currentJobId: current?.job.id ?? null, liveNow, pausedForShow,
    }, { merge: true })
  } catch (e) { log.warn(`Heartbeat failed: ${e.message}`) }
}

// ── running one job ──
const PROGRESS_EVERY_MS = 10_000

async function runJob(id, data) {
  const files = stateFiles(cfg, id)
  const ctx = {
    cfg, site, db: fb.db, proposals, files, job: { id, ...data }, ctl: {},
    cancelled: false, recorded: 0, would: 0, failedIds: new Set(),
    lastProgress: 0, prog: { done: 0, total: 0, note: '' },
    async progress(done, total, note) {
      ctx.prog = { done: Number(done) || 0, total: Number(total) || 0, note: String(note ?? ctx.prog.note ?? '').slice(0, 200) }
      if (Date.now() - ctx.lastProgress < PROGRESS_EVERY_MS) return
      ctx.lastProgress = Date.now()
      await updateDoc(doc(fb.db, 'workerJobs', id), { progress: ctx.prog }).catch(() => {})
    },
    /** Before every song: stop if cancelled or shutting down; otherwise wait out any live show. */
    async gate() {
      if (ctx.cancelled || stopping) return 'stop'
      await live.waitForNoShow({
        shouldStop: () => ctx.cancelled || stopping,
        onPause: async on => {
          pausedForShow = on; liveNow = on
          await updateDoc(doc(fb.db, 'workerJobs', id), { progress: { ...ctx.prog, note: on ? 'Paused: a live show is on air' : 'Resumed' } }).catch(() => {})
          await heartbeat()
        },
      })
      return ctx.cancelled || stopping ? 'stop' : 'go'
    },
  }
  current = ctx
  const unwatch = onSnapshot(doc(fb.db, 'workerJobs', id), s => {
    if (s.get('status') === 'cancelled' && !ctx.cancelled) { ctx.cancelled = true; log.info(`Job ${id} was cancelled.`); ctx.ctl.kill?.() }
  }, () => {})
  await heartbeat()
  let status = 'done', error = null, note = ''
  try {
    if (!isJobType(data.type) || !RUNNERS[data.type]) throw new Error(`Job type not allowed: ${String(data.type).slice(0, 60)}`)
    const p = cleanJobParams(data.type, data.params)
    if (!p.ok) throw new Error(`Params refused: ${p.why}`)
    log.info(`Job ${id} ${data.type} ${JSON.stringify(p.params).slice(0, 200)}${cfg.jobLimit ? ` (limit ${cfg.jobLimit})` : ''}`)
    if (touchesLibrary(data.type) && (await ctx.gate()) === 'stop') throw Object.assign(new Error('Stopped.'), { cancelled: true })
    note = await RUNNERS[data.type](ctx, p.params)
  } catch (e) {
    if (e.cancelled || ctx.cancelled) status = 'cancelled'
    else { status = 'failed'; error = String(e.message).slice(0, 500) }
  }
  unwatch()
  current = null
  if (stopping && status !== 'done' && !ctx.cancelled) { log.info(`Job ${id} left running; it resumes on the next start.`); return }
  if (status !== 'cancelled') {
    const prog = { ...ctx.prog, note: (note || error || ctx.prog.note || '').slice(0, 200) }
    await updateDoc(doc(fb.db, 'workerJobs', id), { status, finishedAt: serverTimestamp(), progress: prog, error })
      .catch(e => log.warn(`Could not finish job ${id}: ${e.message}`))
  }
  log.info(`Job ${id} ${status}${error ? `: ${error}` : ''}${note ? ` (${note})` : ''}`)
  await heartbeat()
}

/** Claims a queued job (queued -> running) unless it changed meanwhile. */
async function claim(id) {
  return runTransaction(fb.db, async tx => {
    const ref = doc(fb.db, 'workerJobs', id)
    const s = await tx.get(ref)
    if (!s.exists() || s.get('status') !== 'queued') return null
    tx.update(ref, { status: 'running', startedAt: serverTimestamp(), progress: { done: 0, total: 0, note: 'Starting' } })
    return s.data()
  })
}

let draining = false, ready = false
async function drain() {
  if (draining || !ready) return
  draining = true
  try {
    while (!stopping && queue.size) {
      const [id] = [...queue.entries()].sort((a, b) => a[1] - b[1])[0]
      queue.delete(id)
      let data
      try { data = await claim(id) } catch (e) { log.warn(`Could not claim ${id}: ${e.message}`); continue }
      if (data) await runJob(id, data)
    }
  } finally { draining = false }
}

// ── listening for jobs (no polling) ──
let unlisten = null
function listen() {
  unlisten?.()
  unlisten = onSnapshot(query(collection(fb.db, 'workerJobs'), where('status', '==', 'queued')), snap => {
    queue.clear()
    for (const d of snap.docs) queue.set(d.id, d.get('createdAt')?.toMillis?.() ?? 0)
    if (snap.size) log.info(`${snap.size} job(s) queued.`)
    drain()
  }, e => log.warn(`Job listener stopped (${e.code || e.message}); it restarts at the next sign-in.`))
}

/** Jobs left "running" by a crash or restart are picked up again (their tools resume from where they stopped). */
async function resumeLeftovers() {
  const snap = await getDocs(query(collection(fb.db, 'workerJobs'), where('status', '==', 'running')))
  for (const d of snap.docs) { log.info(`Resuming job ${d.id} (${d.get('type')}).`); await runJob(d.id, d.data()) }
}

// ── hourly: new media? enqueue a scan. Every 15 minutes: schedule reconcile ──
async function scanCheck() {
  if (current) return
  try {
    const shape = await azura.libraryShape()
    const file = join(cfg.stateDir, 'scan.json')
    const last = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
    if (!last || shape.count > last.count || shape.maxId > last.maxId) {
      try { const r = await site.enqueueScan(); log.info(`New media in AzuraCast (${shape.count} files); queued library.scan ${r.id}.`) }
      catch (e) { if (e.status !== 409) throw e }
    }
    if (last && shape.count < last.count) writeFileSync(file, JSON.stringify({ ...last, count: shape.count, maxId: Math.max(last.maxId, shape.maxId) }))
  } catch (e) { log.warn(`Hourly media check failed: ${e.message}`) }
}
async function reconcile() {
  try { await site.reconcile(); log.debug('Schedule reconcile ok.') } catch (e) { log.warn(`Reconcile failed: ${e.message}`) }
}

// ── --check: a quick health check for installing ──
async function check() {
  const py = spawnSync(cfg.python, cfg.python === 'py' ? ['-3', '--version'] : ['--version'], { encoding: 'utf8' })
  log.info(`Python: ${(py.stdout || py.stderr || py.error?.message || '').trim()}`)
  const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  log.info(`ffmpeg: ${ff.error ? 'MISSING' : (ff.stdout || '').split('\n')[0]}`)
  const lib = spawnSync(cfg.python, [...(cfg.python === 'py' ? ['-3'] : []), '-c', 'import numpy, librosa; print("numpy+librosa ok")'], { encoding: 'utf8' })
  log.info(`Beats add-ons: ${(lib.stdout || lib.stderr).trim().split('\n').pop()}`)
  log.info(`Live show now: ${await live.isLive()}`)
  const shape = await azura.libraryShape()
  log.info(`AzuraCast: ${shape.count} media files`)
  await fb.signIn()
  await heartbeat()
  log.info('Signed in and wrote a heartbeat. All good.')
  process.exit(0)
}

async function shutdown(sig) {
  if (stopping) return
  stopping = true
  log.info(`${sig}: stopping.`)
  current?.ctl.kill?.()
  unlisten?.()
  fb.stop()
  setTimeout(() => process.exit(0), 3000)
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => shutdown(s))
process.on('unhandledRejection', e => log.error('Unhandled:', e))

if (process.argv.includes('--check')) {
  check().catch(e => { log.error(`Check failed: ${e.message}`); process.exit(1) })
} else {
  log.info(`Studio PC worker ${cfg.version} starting. ${cfg.allowApply ? 'Apply is ON (AzuraCast can be changed).' : 'Dry run: apply/undo only report what they would do.'}${cfg.jobLimit ? ` Job limit ${cfg.jobLimit}.` : ''}`)
  fb.onSignedIn(() => listen())
  await fb.signIn()
  await heartbeat()
  setInterval(heartbeat, cfg.heartbeatMs)
  setInterval(() => live.isLive().then(v => { if (v !== liveNow) { liveNow = v; heartbeat() } }).catch(() => {}), cfg.heartbeatMs)
  setInterval(reconcile, cfg.reconcileMs)
  setInterval(scanCheck, cfg.scanCheckMs)
  draining = true
  try { await resumeLeftovers() } catch (e) { log.warn(`Could not check for unfinished jobs: ${e.message}`) }
  draining = false
  ready = true
  drain()
  setTimeout(scanCheck, 60_000)
}
