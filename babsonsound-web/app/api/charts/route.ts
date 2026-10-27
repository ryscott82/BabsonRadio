import { censor } from '@/lib/server/wordFilter'
import { azHistory } from '@/lib/server/azuracast'
import { handle, requireMember } from '@/lib/server/http'

export const runtime = 'nodejs'

// "What got played the most" over the last 7 days, built from the AzuraCast play log. Cached for 10 minutes.
interface Chart { tracks: { title: string; artist: string; plays: number }[]; artists: { artist: string; plays: number }[]; days: number; builtAt: number }
let cache: Chart | null = null

const NOT_MUSIC = /jingle|promo|sweeper|station id|\bads?\b|advert|psa|announce/i

export async function GET(req: Request) {
  return handle(async () => {
    await requireMember(req)
    if (cache && Date.now() - cache.builtAt < 600_000) return cache
    const end = Date.now(), start = end - 7 * 86_400_000
    const rows = (await azHistory(start, end)).filter(r => r.title && r.artist && !NOT_MUSIC.test(r.playlist))
    const tracks = new Map<string, { title: string; artist: string; plays: number }>()
    const artists = new Map<string, number>()
    for (const r of rows) {
      const k = `${r.artist.toLowerCase()}|${r.title.toLowerCase()}`
      const t = tracks.get(k) ?? { title: r.title, artist: r.artist, plays: 0 }
      t.plays++; tracks.set(k, t)
      artists.set(r.artist, (artists.get(r.artist) ?? 0) + 1)
    }
    cache = {
      tracks: [...tracks.values()].sort((a, b) => b.plays - a.plays).slice(0, 25).map(t => ({ ...t, title: censor(t.title), artist: censor(t.artist) })),
      artists: [...artists].map(([artist, plays]) => ({ artist: censor(artist), plays })).sort((a, b) => b.plays - a.plays).slice(0, 15),
      days: 7, builtAt: Date.now(),
    }
    return cache
  })
}
