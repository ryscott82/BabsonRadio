import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline, cleanMode, defaultMode, modeAt, readTimeline, recordingStart, trackAt, type LogRow } from './trackLog.ts'

const T0 = 1_000_000_000_000
const sec = (n: number) => T0 + n * 1000

test('a Music show starts in music mode, anything else in talk mode', () => {
  assert.equal(defaultMode('Music'), 'music')
  assert.equal(defaultMode(' music '), 'music')
  for (const c of ['Talk', 'News', 'Podcast', 'Interview', '', undefined, null]) assert.equal(defaultMode(c), 'talk')
  assert.equal(cleanMode('music'), 'music')
  assert.equal(cleanMode('loud'), '')
})

test('tracks get offsets on the recording clock and end where the next starts or the music stops', () => {
  const rows: LogRow[] = [
    { at: sec(10), kind: 'track', title: 'Bed one', artist: '', bed: true },
    { at: sec(100), kind: 'gap' },
    { at: sec(130), kind: 'track', title: 'Song A', artist: 'Band', art: 'https://x/a.jpg' },
    { at: sec(300), kind: 'track', title: 'Song B', artist: 'Other' }, // crossfaded in, no gap
  ]
  const t = buildTimeline(rows, T0, sec(600), 'talk')
  assert.deepEqual(t.tracks.map(k => [k.title, k.s, k.e, k.bed]), [['Bed one', 10, 100, true], ['Song A', 130, 300, false], ['Song B', 300, 600, false]])
  assert.equal(t.tracks[1].art, 'https://x/a.jpg')
})

test('mode changes are kept in order, repeats and same-second flips collapse', () => {
  const rows: LogRow[] = [
    { at: sec(0), kind: 'mode', mode: 'talk' },
    { at: sec(60), kind: 'mode', mode: 'music' },
    { at: sec(90), kind: 'mode', mode: 'music' },
    { at: sec(120), kind: 'mode', mode: 'talk' },
    { at: sec(120), kind: 'mode', mode: 'music' },
  ]
  const t = buildTimeline(rows, T0, sec(300), 'talk')
  assert.deepEqual(t.modes, [{ s: 0, mode: 'talk' }, { s: 60, mode: 'music' }])
  assert.equal(modeAt(t, 0), 'talk')
  assert.equal(modeAt(t, 59), 'talk')
  assert.equal(modeAt(t, 60), 'music')
  assert.equal(modeAt(t, 299), 'music')
})

test('the first mode row replaces the default when it lands in the first second', () => {
  const t = buildTimeline([{ at: sec(0), kind: 'mode', mode: 'music' }], T0, sec(100), 'talk')
  assert.deepEqual(t.modes, [{ s: 0, mode: 'music' }])
})

test('a track that started a little before the recording clock starts at 0, one after the end is clamped', () => {
  const rows: LogRow[] = [{ at: sec(-3), kind: 'track', title: 'Early' }, { at: sec(99), kind: 'track', title: 'Late' }]
  const t = buildTimeline(rows, T0, sec(100), 'music')
  assert.deepEqual(t.tracks.map(k => [k.title, k.s, k.e]), [['Early', 0, 99], ['Late', 99, 100]])
  // one that starts as the recording ends lasts under a second and is dropped
  const t2 = buildTimeline([{ at: sec(100), kind: 'track', title: 'Too late' }], T0, sec(100), 'music')
  assert.deepEqual(t2.tracks, [])
})

test('rows without a title are skipped, text is cleaned and shortened', () => {
  const t = buildTimeline([{ at: sec(5), kind: 'track', title: '   ' }, { at: sec(6), kind: 'track', title: `A\n${'x'.repeat(300)}`, artist: 'B\t C' }], T0, sec(60), 'talk')
  assert.equal(t.tracks.length, 1)
  assert.ok(t.tracks[0].title.length <= 120 && !/\n/.test(t.tracks[0].title))
  assert.equal(t.tracks[0].artist, 'B C')
})

test('trackAt finds the song playing, null between songs, newest during a crossfade', () => {
  const t = buildTimeline([
    { at: sec(10), kind: 'track', title: 'A' }, { at: sec(50), kind: 'gap' }, { at: sec(70), kind: 'track', title: 'B' },
  ], T0, sec(200), 'music')
  assert.equal(trackAt(t, 9), null)
  assert.equal(trackAt(t, 10)?.title, 'A')
  assert.equal(trackAt(t, 49)?.title, 'A')
  assert.equal(trackAt(t, 50), null)
  assert.equal(trackAt(t, 199)?.title, 'B')
  assert.equal(trackAt(null, 5), null)
})

test('readTimeline accepts what buildTimeline makes and ignores junk', () => {
  const t = buildTimeline([{ at: sec(10), kind: 'track', title: 'A', artist: 'X' }], T0, sec(100), 'music')
  assert.deepEqual(readTimeline(JSON.parse(JSON.stringify(t))), t)
  assert.equal(readTimeline(null), null)
  assert.equal(readTimeline('nope'), null)
  assert.equal(readTimeline({ modes: [{ s: 0, mode: 'talk' }], tracks: [] }), null) // a talk show with no music has nothing to show
  const odd = readTimeline({ modes: [{ s: 'x', mode: 'zzz' }], tracks: [{ title: '', s: 1, e: 5 }, { title: 'ok', s: 5, e: 2 }, { title: 'fine', s: 1, e: 9 }] })
  assert.deepEqual(odd?.tracks.map(k => k.title), ['fine'])
})

test('the audio starts when the show ended minus its length, when that is a few seconds after going live', () => {
  assert.equal(recordingStart(sec(0), sec(600), 595), sec(5))   // BUTT began 5 s after Go live
  assert.equal(recordingStart(sec(0), sec(600), 600), sec(0))
  assert.equal(recordingStart(sec(0), sec(600), 610), sec(0))   // longer than on air: unknown, keep the on-air start
  assert.equal(recordingStart(sec(0), sec(600), 300), sec(0))   // much shorter (BUTT was restarted): keep the on-air start
  assert.equal(recordingStart(sec(0), sec(600), 0), sec(0))
})
