import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clampTime, episodeLink, fmtTime, isEpisodeId, matchSetlist, nextSpeed, parseStart, resumeAt, shareDescription, SPEEDS } from './episodePlayer.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('time reads like a player: m:ss, h:mm:ss, and bad input is 0:00', () => {
  assert.equal(fmtTime(75), '1:15'); assert.equal(fmtTime(3725), '1:02:05'); assert.equal(fmtTime(0), '0:00')
  assert.equal(fmtTime(NaN), '0:00'); assert.equal(fmtTime(-5), '0:00')
})
test('a link says where to start: seconds, 1m23s, 1h2m3s; nonsense is 0', () => {
  assert.equal(parseStart('83'), 83); assert.equal(parseStart('83s'), 83); assert.equal(parseStart('1m23s'), 83); assert.equal(parseStart('1h2m3s'), 3723); assert.equal(parseStart('2m'), 120)
  for (const bad of [null, undefined, '', 'abc', '-5', '1x', 'm', '99999999999']) assert.equal(parseStart(bad), 0, String(bad))
})
test('times stay inside the episode', () => {
  assert.equal(clampTime(-4, 600), 0); assert.equal(clampTime(9999, 600), 599); assert.equal(clampTime(50, 0), 50); assert.equal(clampTime(NaN, 600), 0)
})
test('speed cycles through 1x, 1.25x, 1.5x, 1.75x, 2x, 0.75x and back', () => {
  let s = 1; const seen: number[] = [s]
  for (let i = 0; i < SPEEDS.length; i++) { s = nextSpeed(s); seen.push(s) }
  assert.deepEqual(seen, [1, 1.25, 1.5, 1.75, 2, 0.75, 1]); assert.equal(nextSpeed(3), 1)
})
test('the episode link is /episode/<id>, optionally with a start time in whole seconds', () => {
  assert.equal(episodeLink('https://babsonradio.com/', 'abc_123'), 'https://babsonradio.com/episode/abc_123')
  assert.equal(episodeLink('https://babsonradio.com', 'abc', 83.9), 'https://babsonradio.com/episode/abc?t=83')
  assert.equal(episodeLink('https://babsonradio.com', 'abc', 0.4), 'https://babsonradio.com/episode/abc')
  assert.equal(parseStart(new URL(episodeLink('https://x.com', 'abc', 3723)).searchParams.get('t')), 3723) // what Share writes, the page reads
})
test('only ids made the way the site makes them are accepted', () => {
  assert.equal(isEpisodeId('aB3_-9'), true)
  for (const bad of ['', 'a/b', '../x', 'a b', 'x'.repeat(101), 'a?b']) assert.equal(isEpisodeId(bad), false, bad)
})
test('a remembered position resumes only when it is worth it', () => {
  assert.equal(resumeAt(120, 600), 120); assert.equal(resumeAt(3, 600), 0); assert.equal(resumeAt(595, 600), 0); assert.equal(resumeAt(NaN, 600), 0); assert.equal(resumeAt(500, 0), 500)
})
test('the set list is the one from the same show within 12 hours, closest first, one song per line', () => {
  const H = 3_600_000, T = 1_800_000_000_000
  const docs = [
    { showTitle: 'Friday Mix', startAt: T - 20 * H, songs: 'old' },
    { showTitle: ' friday  mix ', startAt: T + 2 * H, songs: 'a\n\n b \nc' },
    { showTitle: 'Friday Mix', startAt: T + 1 * H, songs: 'near' },
    { showTitle: 'Other Show', startAt: T, songs: 'wrong' },
  ]
  assert.deepEqual(matchSetlist(docs, ['Friday Mix'], T), ['near'])
  assert.deepEqual(matchSetlist(docs.slice(0, 2), ['friday mix'], T), ['a', 'b', 'c'])
  assert.deepEqual(matchSetlist(docs, ['Nope'], T), []); assert.deepEqual(matchSetlist(docs, [''], T), []); assert.deepEqual(matchSetlist(docs, ['Friday Mix'], 0), [])
})
test('the link preview text is short and never mentions private details', () => {
  const t = shareDescription({ showName: 'Friday Mix', contributors: ['Pat', 'Kim'], description: 'x'.repeat(400) })
  assert.ok(t.startsWith('Friday Mix on Babson Radio. With Pat, Kim. ')); assert.equal(t.length, 200)
})

test('the pieces are wired: a public episode opens for anyone, a private one needs the Library, and only public ones get a link preview', () => {
  const api = src('app/api/episodes/[id]/route.ts')
  assert.match(api, /if \(ep\.visibility !== 'public'\) await requireLibrary\(req\)/)
  assert.match(api, /hostUids: _hosts/) // account ids are not sent to the page
  const page = src('app/episode/[id]/page.tsx')
  assert.match(page, /snap\.get\('visibility'\) !== 'public'\) return plain/)
  assert.match(src('app/api/episodes/[id]/audio/route.ts'), /visibility'\) !== 'public'\) await requireLibrary/)
  const row = src('components/EpisodeRow.tsx')
  assert.match(row, /<EpisodePlayer ep=\{ep\} autoPlay \/>/); assert.match(row, /\/episode\/\$\{encodeURIComponent\(ep\.id\)\}/)
  const player = src('components/EpisodePlayer.tsx')
  for (const w of ['/beaver.png', 'nextSpeed', 'BACK_SEC', 'FORWARD_SEC', 'positionKey', 'episodeLink', 'startAt']) assert.ok(player.includes(w), w)
  assert.match(player, /try \{ localStorage/) // storage can be blocked
})
