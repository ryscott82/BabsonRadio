import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLiveArchive, cleanShow } from '../lib/livearchive.mjs'

const make = (over = {}) => {
  const st = { v: over.saved || null }, added = [], removed = [], moved = []
  const a = createLiveArchive({
    store: { load: () => st.v, save: v => { st.v = JSON.parse(JSON.stringify(v)) } }, dir: '/rec', now: () => 1_700_000_000_000, newId: () => 'abc123', sleep: async () => {}, minSec: 60,
    files: { mkdir() {}, move: async (x, y) => { if (over.moveFail) throw new Error('busy'); moved.push([x, y]) }, remove: f => removed.push(f), join: (...p) => p.join('/'), ext: f => (/\.\w+$/.exec(f) || [''])[0] },
    probe: async () => over.sec ?? 600, uploads: { add: t => added.push(t) },
  })
  return { a, st, added, removed, moved }
}

test('cleanShow trims, de-duplicates and limits', () => {
  const s = cleanShow({ title: '  Hi\n there  ', hosts: 'A, b ,a;\nC', description: 'x'.repeat(900), category: 'TALK' })
  assert.deepEqual({ t: s.title, h: s.hosts, d: s.description.length, c: s.category }, { t: 'Hi there', h: ['A', 'b', 'C'], d: 500, c: 'Talk' })
  assert.equal(cleanShow({ category: 'Opera' }).category, '')
})

test('a show is queued with its show info, and the next one starts blank', async () => {
  const { a, added, moved } = make()
  a.begin({ uid: 'u', name: 'Pat', token: 'T' }, 'C:/butt/rec.mp3')
  a.setShow({ title: 'Mix', hosts: 'Pat, Kim' })
  assert.equal(await a.finish(), 'queued')
  assert.deepEqual(moved, [['C:/butt/rec.mp3', '/rec/abc123/show.mp3']])
  assert.equal(added[0].title, 'Mix'); assert.equal(added[0].token, 'T'); assert.deepEqual(added[0].live.hosts, ['Pat', 'Kim'])
  assert.equal(a.show().title, ''); assert.equal(a.active(), false)
})

test('no title or contributors: a dated title and the host’s name are used', async () => {
  const { a, added } = make()
  a.begin({ uid: 'u', name: 'Pat', token: 'T' }, '/b/r.mp3')
  await a.finish()
  assert.match(added[0].title, /^Live show /); assert.deepEqual(added[0].live.hosts, ['Pat'])
})

test('too short is thrown away; a file that cannot move is kept to try again', async () => {
  const s = make({ sec: 20 })
  s.a.begin({ uid: 'u', name: 'P', token: 'T' }, '/b/r.mp3')
  assert.equal(await s.a.finish(), 'short'); assert.deepEqual(s.removed, ['/rec/abc123/show.mp3']); assert.equal(s.added.length, 0)
  const f = make({ moveFail: true })
  f.a.begin({ uid: 'u', name: 'P', token: 'T' }, '/b/r.mp3')
  assert.equal(await f.a.finish(), 'failed'); assert.equal(f.a.active(), true)
})

test('a show left on air by a restart is picked up when BUTT is no longer recording', async () => {
  const { a, st, added } = make()
  a.begin({ uid: 'u', name: 'P', token: 'T' }, '/b/r.mp3')
  const { a: b } = make({ saved: st.v })
  assert.equal(await b.recover(async () => true), 'none')
  assert.equal(await b.recover(async () => false), 'queued'); assert.equal(added.length, 0) // b has its own queue
})
