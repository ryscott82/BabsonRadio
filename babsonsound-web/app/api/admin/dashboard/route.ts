import { AggregateField, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { azuraConfigured } from '@/lib/server/azuracast'
import { getAnnouncement } from '@/lib/server/announcement'

export const runtime = 'nodejs'

let cache: { at: number; v: { sessions: number; hours: number } } | null = null
let answer: { at: number; v: unknown } | null = null // the whole reply, shared for a few seconds so several admins do not each rebuild it

// The numbers at the top of the admin dashboard: on air now, what is next, and the last 24 hours of listening.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    if (answer && Date.now() - answer.at < 10_000) return answer.v
    const db = adminDb()
    const now = Date.now()
    const [np, feed, announcement] = await Promise.all([
      getNowPlaying(),
      buildScheduleFeed(db, { days: 1, showStudentHosts: false, now }),
      getAnnouncement(db, now),
    ])
    const next = feed.filter(i => i.endAt > now).sort((a, b) => a.startAt - b.startAt).slice(0, 8)
      .map(i => ({ title: i.title, startAt: i.startAt, endAt: i.endAt, source: i.source }))
    if (!cache || now - cache.at > 120_000) {
      // Counting is billed far cheaper than reading every session.
      const since = Timestamp.fromMillis(now - 86_400_000)
      try {
        const agg = (await db.collection('listenSessions').where('start', '>', since)
          .aggregate({ count: AggregateField.count(), sum: AggregateField.sum('seconds') }).get()).data()
        cache = { at: now, v: { sessions: agg.count, hours: Math.round(agg.sum / 360) / 10 } }
      } catch (e) {
        // The sum needs the listenSessions index in firestore.indexes.json (deploy it with: firebase deploy --only firestore:indexes).
        // Until it exists, read just the seconds field so the dashboard still loads. This fallback is kept for 2 minutes too.
        console.error('[dashboard sum]', e instanceof Error ? e.message.slice(0, 160) : e)
        const snap = await db.collection('listenSessions').where('start', '>', since).select('seconds').get()
        const total = snap.docs.reduce((a, d) => a + (Number(d.get('seconds')) || 0), 0)
        cache = { at: now, v: { sessions: snap.size, hours: Math.round(total / 360) / 10 } }
      }
    }
    const out = {
      radioConnected: azuraConfigured(),
      nowPlaying: { configured: np.configured, song: np.title ? `${np.artist ? np.artist + ' – ' : ''}${np.title}` : '', listeners: np.listeners, isLive: np.isLive, streamer: np.streamer, playlist: np.playlist },
      onAir: { title: np.blockTitle, isShow: np.isShow, endAt: np.showEnd },
      next, announcement, last24h: cache.v,
    }
    answer = { at: Date.now(), v: out }
    return out
  })
}
