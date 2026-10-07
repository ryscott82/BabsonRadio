import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, isBabsonToken, readJson, requireUser } from '@/lib/server/http'
import { visibleFriends } from '@/lib/server/friends'
import { listeningGroups, type ListeningGroup } from '@/lib/server/groups'

export const runtime = 'nodejs'

const FRESH_MS = 120_000 // a listener counts for 2 minutes after their last heartbeat

// Apps call this every ~60s while playing (listening: true) and once when they stop.
// Clients never read or write presence directly (Firestore rules deny it).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const listening = (await readJson(req)).listening === true
    await adminDb().collection('presence').doc(t.uid).set({
      isListening: listening,
      updatedAt: Timestamp.now(),
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
      if (t && isBabsonToken(t)) {
        const map = await visibleFriends(db, t.uid)
        friends = [...map].filter(([id]) => listening.has(id)).map(([uid, firstName]) => ({ uid, firstName }))
        groups = await listeningGroups(db, t.uid, listening).catch(() => [])
      }
    }
    return { count: listening.size, friends, groups }
  })
}
