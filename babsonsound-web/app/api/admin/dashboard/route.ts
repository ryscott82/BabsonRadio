import { AggregateField, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { azuraConfigured } from '@/lib/server/azuracast'
import { getAnnouncement } from '@/lib/server/announcement'

export const runtime = 'nodejs'

let cache: { at: number; v: { sessions: number; hours: number } } | null = null

// The numbers at the top of the admin dashboard: on air now, what is next, and the last 24 hours of listening.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
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
      const agg = (await db.collection('listenSessions').where('start', '>', Timestamp.fromMillis(now - 86_400_000))
        .aggregate({ count: AggregateField.count(), sum: AggregateField.sum('seconds') }).get()).data()
      const count = agg.count, sum = agg.sum
      cache = { at: now, v: { sessions: count, hours: Math.round(sum / 360) / 10 } }
    }
    return {
      radioConnected: azuraConfigured(),
      nowPlaying: { configured: np.configured, song: np.title ? `${np.artist ? np.artist + ' – ' : ''}${np.title}` : '', listeners: np.listeners, isLive: np.isLive, streamer: np.streamer, playlist: np.playlist },
      onAir: { title: np.blockTitle, isShow: np.isShow, endAt: np.showEnd },
      next, announcement, last24h: cache.v,
    }
  })
}
