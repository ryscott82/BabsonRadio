import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanLiveShow, liveEpisodeDoc, pcRecorderProblem } from './recordingsCore.ts'

const NOW = 1_800_000_000_000

test('live show info from the studio PC is made safe', () => {
  assert.equal(cleanLiveShow(null), null)
  assert.equal(cleanLiveShow('x'), null)
  const s = cleanLiveShow({ hosts: ['Pat Doe', 'pat  doe', ' Kim\nRoe ', '', 5], description: `a${'b'.repeat(600)}`, category: 'interview', startedAt: NOW, endedAt: 12 })
  assert.deepEqual(s?.hosts, ['Pat Doe', 'Kim Roe', '5'])
  assert.equal(s?.description.length, 500); assert.equal(s?.category, 'Interview'); assert.equal(s?.startedAt, NOW); assert.equal(s?.endedAt, 0)
  assert.equal(cleanLiveShow({ category: 'Opera' })?.category, '')
})

test('a host who can go live may file the show even without the recording badge; other recordings still need it', () => {
  const host = { u: 'u1', l: true, exp: NOW + 1 }
  assert.equal(pcRecorderProblem(host, NOW, 14 * 86_400_000, true), null)
  assert.equal(pcRecorderProblem(host, NOW, 14 * 86_400_000)?.code, 'BR-BKG-007')
  assert.equal(pcRecorderProblem({ u: 'u1', exp: NOW + 1 }, NOW, 14 * 86_400_000, true)?.code, 'BR-BKG-007')
})

test('the library episode for a live show is private, audio-only and filed under its hosts', () => {
  const d = liveEpisodeDoc({ title: 'Friday Night Mix!', uid: 'u1', durationSec: 3600, azuracastPath: 'Student recordings/x.mp3', mediaId: 7, uniqueId: 'abc', recordingId: 'rec1',
    live: { hosts: ['Pat'], description: 'd', category: 'Music', startedAt: NOW, endedAt: NOW + 1 } })
  assert.deepEqual({ vis: d.visibility, yt: d.youtubeID, slug: d.showSlug, hosts: d.hostUids, who: d.contributors, uid: d.azUniqueId, dur: d.duration, cat: d.category },
    { vis: 'private', yt: '', slug: 'friday-night-mix', hosts: ['u1'], who: ['Pat'], uid: 'abc', dur: 3600, cat: 'Music' })
})

test('people who joined the studio crew are linked as hosts, so they can manage the episode from their own accounts', () => {
  const d = liveEpisodeDoc({ title: 'BFA Podcast', uid: 'u1', durationSec: 3600, azuracastPath: 'x.mp3', mediaId: 7, uniqueId: 'abc', recordingId: 'rec1', crewUids: ['u2', 'u1', 'u3', ''],
    live: { hosts: ['BFA', 'Alex'], description: '', category: 'Podcast', startedAt: NOW, endedAt: NOW + 1 } })
  assert.deepEqual(d.hostUids, ['u1', 'u2', 'u3']); assert.deepEqual(d.contributors, ['BFA', 'Alex'])
})

test('the site wires it together: live recordings skip the show-attach flow, are hidden from "my recordings", and play from AzuraCast', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  assert.match(read('app/api/booth/recordings/start/route.ts'), /cleanLiveShow\(b\.live\)/)
  assert.match(read('app/api/booth/recordings/complete/route.ts'), /publishLiveEpisode\(db, id\)/)
  assert.match(read('app/api/recordings/mine/route.ts'), /kind'\) !== 'live'/)
  const audio = read('app/api/episodes/[id]/audio/route.ts')
  assert.match(audio, /ondemand\/download/); assert.match(audio, /requireLibrary\(req\)/); assert.match(audio, /visibility'\) !== 'public'/)
  assert.match(read('lib/server/liveEpisode.ts'), /include_in_on_demand: true/)
})
