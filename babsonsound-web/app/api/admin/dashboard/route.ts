import { AggregateField, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { azuraConfigured } from '@/lib/server/azuracast'
import { getAnnouncement } from '@/lib/server/announcement'
import { usageStatus } from '@/lib/server/serverUsage'
import { findAll, loadConfig as loadWords } from '@/lib/server/wordFilter'
import { PENDING_MAX, criticalOf, shapeNext, shapePending, type HostInfo, type PendingSource } from '@/lib/todayData'

export const runtime = 'nodejs'

let cache: { at: number; v: { sessions: number; hours: number } } | null = null
let answer: { at: number; v: unknown } | null = null // the whole reply, shared for 20 seconds so several people do not each rebuild it

// Everything the Today page needs in one call (E-board and Admins): on air now, the next 24 hours with each real show's host (name and email only: no other contact detail,
// ever), pending show requests with why each is waiting (up to 20), the critical strip, and the last 24 hours of listening.
// The whole reply is kept 20 s per server instance, so the page's 60 s refresh from several people costs one build.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    if (answer && Date.now() - answer.at < 20_000) return answer.v
    const db = adminDb()
    const now = Date.now()
    const [np, feed, announcement] = await Promise.all([
      getNowPlaying(),
      buildScheduleFeed(db, { days: 1, showStudentHosts: false, now }),
      getAnnouncement(db, now),
    ])
    // Hosts of the real (slot) shows in the next 24 hours: one batched read of just two fields each (the airSlot id is the request id).
    const soon = feed.filter(i => i.endAt > now && i.startAt < now + 86_400_000 && i.id.startsWith('slot-'))
    const hosts = new Map<string, HostInfo>()
    if (soon.length) {
      const snaps = await db.getAll(...soon.map(i => db.collection('slotRequests').doc(i.id.slice(5))), { fieldMask: ['requesterName', 'requesterEmail'] })
      for (const s of snaps) if (s.exists) hosts.set(s.id, { name: String(s.get('requesterName') ?? ''), email: String(s.get('requesterEmail') ?? '') })
    }
    const next = shapeNext(feed, hosts, now)

    // Pending requests (usually a handful): sorted and cut to 20 here, flags from the text and the requester's `minor` field only.
    const pendSnap = await db.collection('slotRequests').where('status', '==', 'pending').get()
    const pendSrc: PendingSource[] = pendSnap.docs.map(d => ({
      id: d.id, title: String(d.get('title') ?? ''), description: String(d.get('description') ?? ''), location: String(d.get('location') ?? ''),
      requesterName: String(d.get('requesterName') ?? ''), requesterUid: String(d.get('requesterUid') ?? ''),
      startAt: d.get('startAt').toMillis() as number, durationMin: Number(d.get('durationMin') ?? 0), type: String(d.get('type') ?? ''),
      autoApproveAt: (d.get('autoApproveAt')?.toMillis?.() as number | undefined) ?? null, autoBlockedReason: String(d.get('autoBlockedReason') ?? ''), held: d.get('held') === true,
      cleanHours: d.get('cleanHours') === true, conductSigned: typeof d.get('conductSigned') === 'boolean' ? (d.get('conductSigned') as boolean) : null,
    }))
    const shown = [...pendSrc].sort((a, b) => a.startAt - b.startAt).slice(0, PENDING_MAX)
    const uids = [...new Set(shown.map(s => s.requesterUid).filter(Boolean))]
    const minors = new Set<string>()
    if (uids.length) for (const u of await db.getAll(...uids.map(u => db.collection('users').doc(u)), { fieldMask: ['minor'] })) if (u.exists && u.get('minor') === true) minors.add(u.id)
    const words = (await loadWords(db)).custom
    const pending = shapePending(pendSrc, text => findAll(text, words).some(h => h.tier !== 'crude'), uid => minors.has(uid))

    const [deadAir, usage] = await Promise.all([
      db.collection('ops').doc('deadair').get().then(d => d.get('active') === true).catch(() => false),
      usageStatus(db, now).catch(() => null),
    ])
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
      pending: pending.rows, pendingTotal: pending.total,
      critical: criticalOf({ configured: np.configured, npTitle: np.title, npPlayedAt: np.playedAt, deadAirActive: deadAir, usage: usage ? { pct: usage.pct, overall: usage.overall } : null }),
    }
    answer = { at: Date.now(), v: out }
    return out
  })
}
