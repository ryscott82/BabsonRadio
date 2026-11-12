import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUploads, backoffMs, UPLOAD_TRIES, KEEP_DAYS } from '../lib/uploads.mjs'
import { flowUpload, recordingFileName, azFileName, chunkCount } from '../lib/flow.mjs'
import { fakeAzura, fakeSite, router, memFs, clock } from './fakes.mjs'

const bytes = n => Uint8Array.from({ length: n }, (_, i) => i % 251)
const AZ = { base: 'https://az.test', key: 'k', station: 'babson_radio', dir: 'Student recordings' }

function setup(o = {}) {
  const az = fakeAzura(o.az), site = fakeSite(o.site), c = clock(), fs = memFs({ '/rec/a/recording.mp3': bytes(o.size ?? 5_000_000) })
  let saved = o.saved ?? []
  const live = { v: false }
  const q = createUploads({
    store: { load: () => saved, save: v => { saved = JSON.parse(JSON.stringify(v)) } }, fs, fetch: router(az, site), now: c.now,
    az: AZ, site: { url: 'https://site.test', headers: () => ({ 'x-booth-nonce': '1.a', 'x-booth-sig': 'f' }) },
    isLive: async () => live.v, normalize: o.normalize,
  })
  const take = { id: 'AbCdEfGhIjKlMnOpQrSt', uid: 'u1', name: 'Sam', token: 'tok', title: 'My Show: Ep. 1!', ext: '.mp3', file: '/rec/a/recording.mp3', durationSec: 1800, createdAt: c.now() }
  return { az, site, c, fs, q, take, live, saved: () => saved }
}
const drain = async (q, max = 50) => { let n = 0; while (n < max && await q.step()) n++; return n }

test('file names match what AzuraCast stores', () => {
  assert.equal(azFileName('My Show: Ep. 1!'), 'my_show_ep._1')
  const n = recordingFileName('My Show: Ep. 1!', Date.UTC(2026, 10, 12, 15, 30), 'AbCdEf123', '.MP3')
  assert.match(n, /^2026-11-1\d_\d{4}_my_show_ep._1_abcdef\.mp3$/)
  assert.equal(azFileName(n), n) // AzuraCast leaves it as is, so the path is known
  assert.equal(chunkCount(0), 1); assert.equal(chunkCount(2 * 1024 * 1024), 1); assert.equal(chunkCount(2 * 1024 * 1024 + 1), 2)
})

test('backoff doubles from 2 s and stops at 60 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 10].map(n => backoffMs(n)), [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000])
})

test('happy path: uploading -> saving -> uploaded, file reaches AzuraCast whole, website told once', async () => {
  const s = setup()
  const it = s.q.add(s.take)
  assert.equal(s.q.list('u1')[0].phase, 'uploading')
  assert.equal(it.azPath.startsWith('Student recordings/'), true)
  await s.q.step()
  assert.equal(s.q.list('u1')[0].phase, 'saving')
  assert.deepEqual(s.az.files.get(it.azPath), bytes(5_000_000))
  await s.q.step()
  const p = s.q.list('u1')[0]
  assert.equal(p.phase, 'uploaded'); assert.equal(p.percent, 100)
  assert.equal(s.site.recs.get(s.take.id).status, 'uploaded')
  assert.equal(s.site.recs.get(s.take.id).azuracastPath, it.azPath)
  assert.equal(s.site.recs.get(s.take.id).durationSec, 1800)
  assert.ok(s.fs.store.has(s.take.file), 'kept for 7 days after both succeed')
  assert.equal(s.q.list('other').length, 0, 'only the owner sees it')
})

test('upload failure retries with backoff, resumes without re-sending chunks it already has', async () => {
  const s = setup({ az: { failPosts: 1, failAfterChunk: 1 } }) // chunk 2 of 3 fails once
  s.q.add(s.take)
  await s.q.step()
  let p = s.q.list('u1')[0]
  assert.equal(p.phase, 'uploading'); assert.match(p.error, /503/); assert.equal(p.retryInSec, 2)
  assert.equal(await s.q.step(), false, 'waits out the backoff')
  s.c.add(2000)
  const before = s.az.stats().posts
  await s.q.step()
  assert.equal(s.q.list('u1')[0].phase, 'saving')
  assert.equal(s.az.stats().posts - before, 2, 'chunk 1 was skipped (GET said it is there); chunks 2 and 3 sent')
})

test('Failed after 6 tries, Retry starts again, local file never deleted', async () => {
  const s = setup()
  s.az.setDown(true)
  s.q.add(s.take)
  for (let i = 0; i < UPLOAD_TRIES; i++) { await s.q.step(); s.c.add(60_000) }
  const p = s.q.list('u1')[0]
  assert.equal(p.phase, 'failed'); assert.match(p.error, /fetch failed/)
  assert.equal(await s.q.step(), false, 'a failed upload waits for Retry')
  s.c.add(30 * 86_400_000); s.q.cleanup()
  assert.ok(s.fs.store.has(s.take.file))
  s.az.setDown(false)
  s.q.retry(s.take.id)
  assert.equal(s.q.list('u1')[0].phase, 'uploading')
  await drain(s.q)
  assert.equal(s.q.list('u1')[0].phase, 'uploaded')
})

test('website down: keeps retrying forever, keeps the file, finishes when it is back', async () => {
  const s = setup({ site: { down: true } })
  s.q.add(s.take)
  await s.q.step() // upload
  for (let i = 0; i < 20; i++) { await s.q.step(); s.c.add(5 * 60_000) }
  const p = s.q.list('u1')[0]
  assert.equal(p.phase, 'saving'); assert.match(p.error, /safe on this PC/)
  s.c.add(30 * 86_400_000); s.q.cleanup()
  assert.ok(s.fs.store.has(s.take.file), 'not deleted while the website has not confirmed')
  s.site.setDown(false); s.c.add(5 * 60_000)
  await drain(s.q)
  assert.equal(s.q.list('u1')[0].phase, 'uploaded')
})

test('7 days after both succeed the local file is removed', async () => {
  const s = setup()
  s.q.add(s.take)
  await drain(s.q)
  s.c.add(KEEP_DAYS * 86_400_000 - 1000); assert.equal(s.q.cleanup(), 0)
  s.c.add(2000); assert.equal(s.q.cleanup(), 1)
  assert.equal(s.fs.store.has(s.take.file), false); assert.equal(s.q.list('u1').length, 0)
})

test('waits while a show is live; carries on after', async () => {
  const s = setup()
  s.live.v = true
  s.q.add(s.take)
  assert.equal(await s.q.step(), false)
  assert.equal(s.q.list('u1')[0].waitingForLive, true)
  assert.equal(s.az.stats().posts, 0)
  s.live.v = false
  await drain(s.q)
  assert.equal(s.q.list('u1')[0].phase, 'uploaded')
})

test('survives a restart: state on disk, upload resumes', async () => {
  const s = setup({ az: { failPosts: 1, failAfterChunk: 2 } })
  s.q.add(s.take)
  await s.q.step() // chunks 1-2 in, 3 fails
  const disk = s.saved()
  const s2 = setup({ saved: disk })
  // same fake AzuraCast so the chunks it has are still there
  const q2 = createUploads({
    store: { load: () => disk, save: () => {} }, fs: s.fs, fetch: router(s.az, s.site), now: () => s.c.now() + 10_000,
    az: AZ, site: { url: 'https://site.test', headers: () => ({ 'x-booth-nonce': '1.a', 'x-booth-sig': 'f' }) }, isLive: async () => false,
  })
  void s2
  const before = s.az.stats().posts
  await drain(q2)
  assert.equal(q2.list('u1')[0].phase, 'uploaded')
  assert.equal(s.az.stats().posts - before, 1, 'only the last chunk was sent again')
})

test('a booking or show that is gone: saved on its own instead of never', async () => {
  const s = setup()
  const realFetch = s.site.fetch
  s.site.fetch = async (url, init) => (JSON.parse(init.body).requestId ? Response.json({ error: 'Show not found.' }, { status: 404 }) : realFetch(url, init))
  s.q.add({ ...s.take, requestId: 'req1', cleanConfirmed: true })
  await drain(s.q)
  const p = s.q.list('u1')[0]
  assert.equal(p.phase, 'uploaded'); assert.match(p.warning, /gone/)
})

test('loudness runs only after upload and website both succeed, and waits while live', async () => {
  const calls = []
  const s = setup({ normalize: async it => { calls.push(it.mediaId); return 'done' } })
  s.live.v = false
  s.q.add(s.take)
  await s.q.step(); assert.equal(calls.length, 0)
  await s.q.step(); assert.equal(calls.length, 0)
  s.live.v = true
  assert.equal(await s.q.step(), false); assert.equal(calls.length, 0)
  s.live.v = false
  await s.q.step()
  assert.deepEqual(calls, [100])
  assert.equal(s.q.list('u1')[0].normalize, 'done')
})

test('flowUpload of a tiny file sends one chunk', async () => {
  const az = fakeAzura()
  await flowUpload({ ...AZ, fetch: az.fetch, filename: 'x.mp3', identifier: 'id1', size: 10, readChunk: async (a, b) => bytes(10).subarray(a, b) })
  assert.deepEqual(az.files.get('Student recordings/x.mp3'), bytes(10))
  assert.deepEqual(az.stats(), { posts: 1, gets: 0 })
})
