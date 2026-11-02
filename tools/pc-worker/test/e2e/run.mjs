// End-to-end test of the PC worker with JOB_LIMIT=3, the real Python tools, and stand-ins for Firestore (with the worker's
// rules), the site's worker API (real lib/worker.ts checks), AzuraCast and the studio helper.
//   node --experimental-strip-types test/e2e/run.mjs propose   (dry run: ALLOW_APPLY=0)
//   node --experimental-strip-types test/e2e/run.mjs apply     (ALLOW_APPLY=1: apply, then undo)
import { register } from 'node:module'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const phase = process.argv[2]
const dir = process.env.E2E_DIR || mkdtempSync(join(tmpdir(), 'pcw-'))
const SECRET = 'e2e-secret-0123456789abcdefghijklmnopqrstuvwxyz'
const KEY = 'e2e-az:key-9f8e7d6c5b4a'
Object.assign(process.env, {
  SITE_URL: 'http://127.0.0.1:3100', WORKER_SECRET: SECRET, FIREBASE_API_KEY: 'fake', FIREBASE_PROJECT_ID: 'demo-babsonradio',
  AZURACAST_URL: 'http://127.0.0.1:8090', AZURACAST_STATION: 'babson_radio', AZURACAST_API_KEY: KEY,
  HELPER_URL: 'http://127.0.0.1:7781', HELPER_ORIGIN: 'https://babsonradio.com', PYTHON: process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'),
  ALLOW_APPLY: phase === 'apply' ? '1' : '0', JOB_LIMIT: '3', STATE_DIR: join(dir, 'state'), LOG_DIR: join(dir, 'logs'),
  FAKE_STORE_FILE: join(dir, 'store.json'), FAKE_MEDIA_FILE: join(dir, 'media.json'), LIVE_RECHECK_MS: '1500', ART_BACKUP_DIR: join(dir, 'art_backup'),
})
register('./hooks.mjs', import.meta.url)
const fs = await import('./fake-firestore.mjs')
const { startSite, startAzura, startHelper, events, flags, media, azCalls } = await import('./fakes.mjs')
startSite(3100, SECRET); startAzura(8090, KEY); startHelper(7781, 'https://babsonradio.com')
await import('../../worker.mjs')

let failed = 0
const ok = (cond, what) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}`); if (!cond) failed++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const job = id => fs.store.get(`workerJobs/${id}`)
let n = 0
function enqueue(type, params = {}) {
  const id = `${phase}-${++n}-${type.replace(/\W/g, '')}`
  fs.adminSet(`workerJobs/${id}`, { type, params, status: 'queued', createdBy: 'admin', createdAt: new fs.Timestamp(Date.now()), progress: { done: 0, total: 0, note: '' }, error: null })
  return id
}
async function finish(id, max = 180_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < max) { const s = job(id)?.status; if (['done', 'failed', 'cancelled'].includes(s)) return job(id); await sleep(300) }
  return job(id)
}
const prop = id => fs.store.get(`workerProposals/${id}`)

if (phase === 'propose') {
  let j = await finish(enqueue('library.scan'))
  ok(j.status === 'done' && /4 songs/.test(j.progress.note), `library.scan done: "${j.progress.note}"`)

  j = await finish(enqueue('library.fetch_metadata'))
  ok(j.status === 'done', `fetch_metadata done: "${j.progress.note}"`)
  ok(prop('1')?.proposed.title === 'Hotline Bling' && prop('1')?.status === 'pending', `song 1 proposed "${prop('1')?.proposed.title}"`)
  ok(prop('2')?.proposed.artist === 'Frank Ocean' && prop('2')?.proposed.title === 'Ivy', `song 2 split into "${prop('2')?.proposed.artist}" / "${prop('2')?.proposed.title}"`)
  ok(prop('3')?.proposed.artist === 'MGMT', `song 3 artist "${prop('3')?.proposed.artist}"`)
  ok(!prop('4'), 'song 4 not touched (JOB_LIMIT=3)')
  ok(/^drake\|hotlinebling$/.test(prop('1')?.sortKey || ''), `sortKey ${prop('1')?.sortKey}`)

  j = await finish(enqueue('library.measure_loudness'))
  ok(j.status === 'done' && Number.isFinite(prop('1')?.loudness?.gainDb), `measure_loudness: song 1 ${prop('1')?.loudness?.lufs} LUFS -> ${prop('1')?.loudness?.gainDb} dB`)

  j = await finish(enqueue('library.analyze_beats'))
  const b = [1, 2, 3].map(i => prop(String(i))?.beat?.bpm)
  ok(j.status === 'done' && Math.abs(b[0] - 120) < 3 && Math.abs(b[2] - 140) < 3, `analyze_beats: ${b.join(', ')} BPM (expected 120, 100, 140)`)

  j = await finish(enqueue('library.fetch_art', { onlyMissing: true }))
  ok(j.status === 'done' || j.status === 'failed', `fetch_art ran (no internet here): ${j.status} "${j.progress.note || j.error}"`)

  // live show: the job waits, then carries on
  flags.helperLive = true
  const live = enqueue('library.measure_loudness', { songIds: ['1'] })
  await sleep(4000)
  ok(job(live).status === 'running' && /Paused/.test(job(live).progress.note) && fs.store.get('workerStatus/pc').pausedForShow === true, `paused for live show: "${job(live).progress.note}"`)
  flags.helperLive = false
  j = await finish(live)
  ok(j.status === 'done', 'continued after the show ended')

  // cancel
  const c = enqueue('library.analyze_beats', { force: true })
  for (let i = 0; i < 100 && job(c).status !== 'running'; i++) await sleep(100)
  await sleep(1500)
  fs.adminSet(`workerJobs/${c}`, { ...job(c), status: 'cancelled' })
  await sleep(4000)
  ok(job(c).status === 'cancelled' && fs.store.get('workerStatus/pc').currentJobId === null, 'cancelled job stops and the worker goes idle')

  // refused jobs
  j = await finish(enqueue('library.nuke'))
  ok(j.status === 'failed' && /not allowed/.test(j.error), `unknown job type refused: ${j.error}`)
  j = await finish(enqueue('library.fetch_art', { songIds: ['../../etc/passwd'] }))
  ok(j.status === 'failed' && /refused/.test(j.error), `bad params refused: ${j.error}`)
  j = await finish(enqueue('schedule.reconcile'))
  ok(j.status === 'done' && flags.reconciles >= 1, 'schedule.reconcile calls the site')

  // approve and dry-run apply
  for (const i of ['1', '2', '3']) fs.adminSet(`workerProposals/${i}`, { ...prop(i), status: 'approved' })
  const before = events.length
  j = await finish(enqueue('library.apply'))
  ok(j.status === 'done' && /Dry run/.test(j.progress.note), `apply dry run: "${j.progress.note}"`)
  ok(events.length === before, 'dry run: nothing recorded, nothing written to AzuraCast')
  ok(['1', '2', '3'].every(i => prop(i).status === 'approved'), 'dry run: proposals stay approved')
}

if (phase === 'apply') {
  flags.fail429 = 1
  const t0 = Date.now()
  const a = enqueue('library.apply')
  let j = await finish(a)
  ok(j.status === 'done', `apply done: "${j.progress.note}" ${j.error || ''}`)
  ok(media.get('1').title === 'Hotline Bling' && media.get('2').artist === 'Frank Ocean' && media.get('3').artist === 'MGMT', 'AzuraCast tags changed')
  ok(typeof media.get('1').amplify === 'number', `amplify set on song 1: ${media.get('1').amplify}`)
  const writes = events.filter(e => e.kind === 'azwrite' && e.t >= t0)
  ok(writes.length > 0 && writes.every(w => events.some(r => r.kind === 'record' && r.songId === w.songId && r.field === w.field && r.t <= w.t)), `every AzuraCast write (${writes.length}) was recorded first`)
  ok(fs.store.get('libraryBeats/drake|hotlinebling')?.value?.bpm > 0, 'beat stored under the new artist and title')
  ok(['1', '2', '3'].every(i => prop(i).status === 'applied'), 'proposals marked applied')
  const hits429 = azCalls.filter(c => c.t >= t0 && c.m === 'PUT').length
  ok(hits429 >= 2, `429 was retried (${hits429} PUT calls)`)
  const py = azCalls.filter(c => c.t >= t0 && /file\/\d+$/.test(c.p)).map(c => c.t)
  const gaps = py.slice(1).map((t, i) => t - py[i]).filter(g => g < 30_000)
  ok(gaps.length && Math.min(...gaps) >= 900, `AzuraCast calls spaced at least ${Math.min(...gaps)} ms apart`)

  j = await finish(enqueue('library.undo', { jobId: a }))
  ok(j.status === 'done', `undo done: "${j.progress.note}" ${j.error || ''}`)
  ok(media.get('1').title === 'Hotline Bling (Official Video)' && media.get('2').artist === '' && media.get('2').title === 'Frank Ocean - Ivy' && media.get('3').artist === 'MGMT - Topic' && media.get('1').amplify === null, 'AzuraCast back to the original tags and gain')
  const undos = [...fs.store.keys()].filter(k => k.startsWith('libraryChanges/undo_'))
  ok(undos.length === 9, `${undos.length} undo records written (each of the 9 changes undone once)`)
  j = await finish(enqueue('library.undo', { jobId: a }))
  ok(j.status === 'done' && /^0 changes undone, \d+ were already undone, 0 songs failed/.test(j.progress.note), `second undo does nothing: "${j.progress.note}"`)

  const logText = readFileSync(join(dir, 'logs', 'worker.log'), 'utf8')
  ok(!logText.includes(SECRET) && !logText.includes(KEY) && !logText.includes('fake-id-token'), 'log has no secrets or tokens')
}

console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASSED'} (${phase}) ${dir}`)
process.exit(failed ? 1 : 0)
