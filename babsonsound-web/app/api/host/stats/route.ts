import { FieldPath, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { hostContext, hostShows } from '@/lib/server/host'
import { EMOJIS } from '@/lib/server/live'

export const runtime = 'nodejs'

// How a show is doing: each airing's listeners, reactions and ratings, the best and worst songs, and where it ranks.
const OCC = /^(weekly|slot|event)-[A-Za-z0-9_-]+$/
const K = 5 // ratings needed before a show's own average counts as much as the station average
const round1 = (n: number) => Math.round(n * 10) / 10

export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const c = await hostContext(req, db, now)
    const mine = await hostShows(db, c.t.uid, now, 35)
    const titles = new Map<string, string>()
    for (const s of mine) titles.set(s.key.replace(':', '-'), s.title)
    const want = new URL(req.url).searchParams.get('showKey') ?? ''
    if (want && !OCC.test(want)) throw new HttpError(400, 'Unknown show.')
    const showKey = want && (c.staff || titles.has(want)) ? want : [...titles.keys()][0]
    if (!showKey) return { shows: [], stats: null }

    const lo = `${showKey}_`, hi = `${showKey}_`
    const since = Timestamp.fromMillis(now - 60 * 86_400_000)
    const [rx, ratings, samples, sessions, songs, allRatings] = await Promise.all([
      db.collection('reactions').where(FieldPath.documentId(), '>=', lo).where(FieldPath.documentId(), '<', hi).get(),
      db.collection('ratings').where('showKey', '==', showKey).get(),
      db.collection('listenerSamples').where('occId', '>=', lo).where('occId', '<', hi).get(),
      db.collection('listenSessions').where('occId', '>=', lo).where('occId', '<', hi).get(),
      db.collection('songRatings').where('occId', '>=', lo).where('occId', '<', hi).get(),
      db.collection('ratings').where('at', '>', since).get(),
    ])

    type A = { occId: string; startAt: number; samples: number[]; people: Set<string>; reactions: number; stars: number[] }
    const air = new Map<string, A>()
    const get = (occId: string) => {
      let a = air.get(occId)
      if (!a) { a = { occId, startAt: Number(occId.split('_').pop()) || 0, samples: [], people: new Set(), reactions: 0, stars: [] }; air.set(occId, a) }
      return a
    }
    const totals: Record<string, number> = Object.fromEntries(EMOJIS.map(e => [e, 0]))
    for (const d of rx.docs) {
      const counts = (d.get('counts') ?? {}) as Record<string, number>
      for (const [e, n] of Object.entries(counts)) { totals[e] = (totals[e] ?? 0) + (n ?? 0); get(d.id).reactions += n ?? 0 }
    }
    for (const d of ratings.docs) get(String(d.get('occId'))).stars.push(d.get('stars') as number)
    for (const d of samples.docs) get(String(d.get('occId'))).samples.push(Number(d.get('listeners')) || 0)
    for (const d of sessions.docs) get(String(d.get('occId'))).people.add(String(d.get('uid')))

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    const airings = [...air.values()].filter(a => a.startAt > 0).sort((a, b) => b.startAt - a.startAt).slice(0, 12).map(a => ({
      occId: a.occId, startAt: a.startAt, avgListeners: round1(avg(a.samples)), peakListeners: Math.max(0, ...a.samples),
      tunedIn: a.people.size, reactions: a.reactions, ratingAvg: round1(avg(a.stars)), ratingCount: a.stars.length,
    }))

    // Songs people rated while this show was on
    const bySong = new Map<string, { title: string; artist: string; stars: number[] }>()
    for (const d of songs.docs) {
      const id = String(d.get('songId'))
      const x = bySong.get(id) ?? { title: String(d.get('title')), artist: String(d.get('artist')), stars: [] }
      x.stars.push(d.get('stars') as number); bySong.set(id, x)
    }
    const songList = [...bySong.values()].map(x => ({ title: x.title, artist: x.artist, avg: round1(avg(x.stars)), count: x.stars.length }))
      .sort((a, b) => b.avg * Math.min(b.count, 3) - a.avg * Math.min(a.count, 3))

    // Where this show ranks among shows (last 60 days, by rating pulled toward the station average)
    const groups = new Map<string, number[]>()
    for (const d of allRatings.docs) {
      if (d.get('isShow') === false) continue
      const key = String(d.get('showKey') ?? String(d.get('occId')).replace(/_\d{10,14}$/, ''))
      groups.set(key, [...(groups.get(key) ?? []), d.get('stars') as number])
    }
    const all = [...groups.values()].flat()
    const station = avg(all) || 3.5
    const shrunk = (xs: number[]) => (xs.length * avg(xs) + K * station) / (xs.length + K)
    const ranked = [...groups.entries()].map(([k, xs]) => ({ k, s: shrunk(xs) })).sort((a, b) => b.s - a.s)
    const rankIdx = ranked.findIndex(r => r.k === showKey)

    const mineStars = ratings.docs.map(d => d.get('stars') as number)
    return {
      shows: [...titles.entries()].map(([key, title]) => ({ key, title })),
      showKey,
      stats: {
        title: titles.get(showKey) ?? showKey,
        ratingAvg: round1(avg(mineStars)), ratingCount: mineStars.length, stationAvg: round1(station),
        rank: rankIdx >= 0 ? rankIdx + 1 : null, rankOf: ranked.length,
        reactions: totals,
        avgListeners: round1(avg(airings.filter(a => a.avgListeners > 0).map(a => a.avgListeners))),
        peakListeners: Math.max(0, ...airings.map(a => a.peakListeners)),
        airings,
        bestSongs: songList.slice(0, 5),
        lowSongs: songList.length > 5 ? songList.slice(-3).reverse() : [],
      },
    }
  })
}
