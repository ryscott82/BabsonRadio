import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { visibleFriends } from '@/lib/server/friends'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { listeningGroups, type ListeningGroup } from '@/lib/server/groups'

export const runtime = 'nodejs'

const FRESH_MS = 240_000 // a listener counts for 4 minutes after their last heartbeat (apps send one every 2 minutes)
const YEAR_MS = 366 * 86_400_000

// Apps call this every ~2 minutes while playing (listening: true) and once when they stop.
// Clients never read or write presence directly (Firestore rules deny it).
//
// The listening log: one `listenSessions` record per stretch of listening (who, when, how long, web or iOS, what was on).
// It is written when a stretch starts, every ~10 minutes while it goes on, and when it stops. If an app disappears
// without saying goodbye, the next heartbeat closes the old stretch at its last known time.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const body = await readJson(req)
    const listening = body.listening === true
    const platform = body.platform === 'ios' ? 'ios' : 'web'
    const db = adminDb()
    const now = Date.now()
    const ref = db.collection('presence').doc(t.uid)
    const prev = await ref.get()
    const prevAt = (prev.get('updatedAt') as Timestamp | undefined)?.toMillis() ?? 0
    const prevSession = prev.get('sessionId') as string | undefined
    const wasActive = !!prevSession && prev.get('isListening') === true && now - prevAt < FRESH_MS + 60_000
    const sessions = db.collection('listenSessions')
    const seconds = (from: number, to: number) => Math.max(0, Math.round((to - from) / 1000))
    const startOf = (prev.get('sessionStart') as number | undefined) ?? prevAt

    let sessionId = wasActive ? prevSession : undefined
    const sessionStart = wasActive ? startOf : now
    if (prevSession && !wasActive && prev.get('isListening') === true) {
      // The old stretch ended without a goodbye: close it where we last heard from it.
      await sessions.doc(prevSession).set({ end: Timestamp.fromMillis(prevAt), seconds: seconds(startOf, prevAt) }, { merge: true })
    }
    if (listening) {
      if (!sessionId) {
        const np = await getNowPlaying().catch(() => null)
        const doc = sessions.doc()
        sessionId = doc.id
        await doc.set({
          uid: t.uid, platform, start: Timestamp.fromMillis(now), end: Timestamp.fromMillis(now), seconds: 0,
          label: np?.blockTitle ?? '', occId: np?.occId ?? '', exp: Timestamp.fromMillis(now + YEAR_MS),
        })
      } else if (Math.floor(prevAt / 600_000) !== Math.floor(now / 600_000)) {
        await sessions.doc(sessionId).set({ end: Timestamp.fromMillis(now), seconds: seconds(sessionStart, now) }, { merge: true })
      }
    } else if (wasActive && prevSession) {
      await sessions.doc(prevSession).set({ end: Timestamp.fromMillis(now), seconds: seconds(startOf, now) }, { merge: true })
    }
    await ref.set({
      isListening: listening, updatedAt: Timestamp.fromMillis(now),
      ...(listening && sessionId ? { sessionId, sessionStart } : { sessionId: FieldValue.delete(), sessionStart: FieldValue.delete() }),
    })
    return { ok: true }
  })
}

// Anyone can see how many are tuned in (invisible people count anonymously).
// Verified students additionally see the first names of connected contacts who are tuned in
// and not invisible.
export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const cutoff = Timestamp.fromMillis(Date.now() - FRESH_MS)
    const live = await db.collection('presence').where('updatedAt', '>', cutoff).get()
    const listening = new Set(live.docs.filter(d => d.get('isListening') === true).map(d => d.id))

    let friends: { uid: string; firstName: string }[] = []
    let groups: ListeningGroup[] = []
    if (req.headers.get('authorization')) {
      const t = await requireUser(req).catch(() => null)
      if (t && (await accessOf(t)).level !== 'guest') {
        const map = await visibleFriends(db, t.uid)
        friends = [...map].filter(([id]) => listening.has(id)).map(([uid, firstName]) => ({ uid, firstName }))
        groups = await listeningGroups(db, t.uid, listening).catch(() => [])
      }
    }
    return { count: listening.size, friends, groups }
  })
}
