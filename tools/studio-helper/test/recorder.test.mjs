import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { createRecorder } from '../lib/recorder.mjs'
import { clock } from './fakes.mjs'

// A pretend BUTT: -r opens "rec.mp3" in its folder (always the same name, like BUTT without date placeholders), -t closes it.
function fakeButt(dir) {
  const st = { connected: false, connecting: false, recording: false, recordPath: '', n: 0 }
  const butt = async args => {
    if (args[0] === '-r') { st.recording = true; st.n++; st.recordPath = join(dir, 'rec.mp3'); writeFileSync(st.recordPath, `piece${st.n};`) }
    if (args[0] === '-t') { st.recording = false }
    return ''
  }
  const status = async () => ({ ...st, recordPath: st.recording ? st.recordPath : '' })
  return { butt, status, st }
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'rec-test-')), buttDir = join(root, 'butt'), recDir = join(root, 'recordings')
  mkdirSync(buttDir); mkdirSync(recDir)
  const b = fakeButt(buttDir), c = clock()
  let saved = null
  const mk = () => createRecorder({
    butt: b.butt, status: b.status, dir: recDir, now: c.now, sleep: async () => {},
    store: { load: () => saved, save: v => { saved = JSON.parse(JSON.stringify(v)) } },
    files: { mkdir: d => mkdirSync(d, { recursive: true }), move: async (a, z) => renameSync(a, z), exists: existsSync, removeDir: d => rmSync(d, { recursive: true, force: true }), join, ext: f => extname(f) },
    concat: async (files, out) => { writeFileSync(out, files.map(f => readFileSync(f, 'utf8')).join('')); files.forEach(f => rmSync(f)) },
    probe: async () => 0,
  })
  return { root, recDir, b, c, mk, rec: mk() }
}
const who = { u: 'u1', n: 'Sam Lee' }

test('start, pause, resume, stop: pieces joined, BUTT never overwrites, time counts only while recording', async () => {
  const s = setup()
  await s.rec.start(who)
  assert.equal(s.rec.state().state, 'recording')
  s.c.add(60_000)
  assert.equal(s.rec.state().elapsedSec, 60)
  await s.rec.pause()
  assert.equal(s.rec.state().state, 'paused')
  s.c.add(5 * 60_000) // a break: not counted
  assert.equal(s.rec.state().elapsedSec, 60)
  await s.rec.resume()
  s.c.add(30_000)
  const t = await s.rec.stop()
  assert.equal(t.durationSec, 90)
  assert.equal(readFileSync(t.file, 'utf8'), 'piece1;piece2;')
  assert.equal(s.rec.state().state, 'idle')
  assert.deepEqual(s.rec.takesFor('u1').map(x => x.id), [t.id])
  assert.deepEqual(s.rec.takesFor('u2'), [])
})

test('refuses to record while the station is live from this PC, or while BUTT is already recording', async () => {
  const s = setup()
  s.b.st.connected = true
  await assert.rejects(s.rec.start(who), /live from this PC/)
  s.b.st.connected = false; s.b.st.recording = true
  await assert.rejects(s.rec.start(who), /already recording/)
  assert.equal(s.rec.active(), false)
})

test('a single piece is just moved; discard deletes only an unsaved take', async () => {
  const s = setup()
  await s.rec.start(who); s.c.add(10_000)
  const t = await s.rec.stop()
  assert.equal(readFileSync(t.file, 'utf8'), 'piece1;')
  assert.equal(s.rec.discard(t.id), true)
  assert.equal(existsSync(t.file), false)
  assert.equal(s.rec.discard('nope'), false)
})

test('a helper restart mid-recording keeps the take (state on disk)', async () => {
  const s = setup()
  await s.rec.start(who); s.c.add(20_000)
  const again = s.mk() // the helper restarted; BUTT kept recording
  assert.equal(again.state().state, 'recording')
  s.c.add(10_000)
  const t = await again.stop()
  assert.equal(t.durationSec, 30)
  assert.equal(readFileSync(t.file, 'utf8'), 'piece1;')
})

test('stop with nothing recorded is an error, and after save the take is forgotten but its file stays for the upload', async () => {
  const s = setup()
  await assert.rejects(s.rec.stop(), /Nothing is recording/)
  await s.rec.start(who); s.c.add(5000)
  const t = await s.rec.stop()
  s.rec.forget(t.id)
  assert.deepEqual(s.rec.takesFor('u1'), [])
  assert.ok(existsSync(t.file))
  assert.deepEqual(readdirSync(join(s.recDir)).filter(f => f !== t.id), [])
})
