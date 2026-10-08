import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireStaff } from '@/lib/server/http'

export const runtime = 'nodejs'

// The listening log: who listened, when, for how long. Staff only (it names people).
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const db = adminDb()
    const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7))
    const since = Date.now() - days * 86_400_000
    const snap = await db.collection('listenSessions').where('start', '>', Timestamp.fromMillis(since)).orderBy('start', 'desc').limit(1500).get()
    const uids = [...new Set(snap.docs.map(d => String(d.get('uid'))))]
    const names = new Map<string, string>()
    for (let i = 0; i < uids.length; i += 100) {
      const docs = await db.getAll(...uids.slice(i, i + 100).map(u => db.collection('users').doc(u)))
      for (const u of docs) {
        const n = [u.get('firstName') ?? u.get('displayName'), u.get('lastName')].filter(Boolean).join(' ')
        names.set(u.id, n || String(u.get('email') ?? u.id))
      }
    }
    const sessions = snap.docs.map(d => {
      const start = (d.get('start') as Timestamp).toMillis()
      const end = (d.get('end') as Timestamp).toMillis()
      return {
        uid: String(d.get('uid')), name: names.get(String(d.get('uid'))) ?? 'Unknown', platform: String(d.get('platform') ?? 'web'),
        label: String(d.get('label') ?? ''), start, end, minutes: Math.round(((d.get('seconds') as number | undefined) ?? (end - start) / 1000) / 60),
      }
    })
    const hours = new Array(24).fill(0) // listening minutes by hour of day (UTC; the page shifts it to local time)
    for (const s of sessions) for (let t = s.start; t < s.end; t += 600_000) hours[new Date(t).getUTCHours()] += Math.min(10, (s.end - t) / 60_000)
    return {
      days, truncated: snap.size >= 1500,
      uniqueListeners: uids.length, sessions: sessions.length,
      totalHours: Math.round(sessions.reduce((a, s) => a + s.minutes, 0) / 6) / 10,
      hoursUtc: hours.map(Math.round),
      list: sessions.slice(0, 500),
    }
  })
}
