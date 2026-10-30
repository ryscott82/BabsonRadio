import test from 'node:test'
import assert from 'node:assert/strict'
import { CHUNK_BYTES, DEFAULT_UPLOAD_LIMITS as L, MB, EMPTY_USAGE, chunkCount, cleanFileName, cleanFolder, fileProblem, judgeChunk } from './uploads.ts'

test('pieces stay under Vercel\'s request size and cover the whole file', () => {
  assert.ok(CHUNK_BYTES < 4.5 * MB)
  assert.equal(chunkCount(1), 1)
  assert.equal(chunkCount(CHUNK_BYTES), 1)
  assert.equal(chunkCount(CHUNK_BYTES + 1), 2)
  assert.equal(chunkCount(10 * MB), 4)
})

test('a piece is allowed until a limit is reached, and the reason says which', () => {
  const u = EMPTY_USAGE('2026-10')
  assert.equal(judgeChunk(u, L, CHUNK_BYTES, 8 * MB, 10).ok, true)
  assert.equal(judgeChunk(u, { ...L, enabled: false }, CHUNK_BYTES, 8 * MB, 10).ok, false)
  assert.match(String((judgeChunk(u, L, CHUNK_BYTES, 8 * MB, 90) as { reason: string }).reason), /paused/)
  assert.match(String((judgeChunk({ ...u, calls: L.monthlyCalls }, L, CHUNK_BYTES, 8 * MB, 10) as { reason: string }).reason), /call limit/)
  assert.match(String((judgeChunk({ ...u, bytes: L.monthlyMB * MB }, L, CHUNK_BYTES, 8 * MB, 10) as { reason: string }).reason), /monthly upload data/)
  assert.match(String((judgeChunk({ ...u, todayBytes: L.dailyMB * MB }, L, CHUNK_BYTES, 8 * MB, 10) as { reason: string }).reason), /daily/)
  assert.equal(judgeChunk(u, L, CHUNK_BYTES, (L.maxFileMB + 1) * MB, 10).ok, false)
})

test('a warning shows once the month is mostly used', () => {
  const v = judgeChunk({ ...EMPTY_USAGE('2026-10'), bytes: 0.85 * L.monthlyMB * MB }, L, CHUNK_BYTES, 8 * MB, 10)
  assert.equal(v.ok, true)
  assert.ok(v.ok && v.warn)
})

test('only mp3 files within the size limit', () => {
  assert.equal(fileProblem('a.mp3', 5 * MB, L), null)
  assert.match(String(fileProblem('a.wav', 5 * MB, L)), /mp3/)
  assert.match(String(fileProblem('a.mp3', 0, L)), /empty/)
  assert.match(String(fileProblem('a.mp3', 100 * MB, L)), /limit/)
})

test('file and folder names cannot escape the media folder', () => {
  assert.equal(cleanFileName('../../etc/Song: One?.mp3'), 'Song One.mp3')
  assert.equal(cleanFolder('Rock/90s'), 'Rock/90s')
  assert.equal(cleanFolder('/Rock//90s/'), 'Rock/90s')
  assert.equal(cleanFolder(''), '')
  assert.equal(cleanFolder('../secrets'), null)
  assert.equal(cleanFolder('a/b/c/d/e'), null)
  assert.equal(cleanFolder('bad<name>'), null)
})
