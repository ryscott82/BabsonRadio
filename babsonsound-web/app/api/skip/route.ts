import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireUser } from '@/lib/server/http'
import { bump } from '@/lib/server/earnedEmojis'
import { azSkip, azuraConfigured, skipState } from '@/lib/server/skipVotes'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    return stripKey(await skipState(adminDb(), t.uid))
  })
}

// Ask to skip the song that is playing (auto DJ only). Needs you to be tuned in. At 90% of listeners, it skips.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const db = adminDb()
    const now = Date.now()
    let s = await skipState(db, t.uid, now)
    if (!s.eligible) throw new HttpError(409, 'Songs can only be skipped when the station is playing its own music, not during a live show.')
    const me = await db.collection('presence').doc(t.uid).get()
    const fresh = (me.get('updatedAt') as Timestamp | undefined)?.toMillis() ?? 0
    if (me.get('isListening') !== true || now - fresh > 240_000) throw new HttpError(403, 'Press play first. Only people listening can ask to skip.')
    if (s.skipped) return { ...stripKey(s), skipped: true }

    await db.collection('skipVotes').doc(s.key).set({ voters: FieldValue.arrayUnion(t.uid), at: Timestamp.fromMillis(now) }, { merge: true })
    await bump(db, t.uid)
    s = await skipState(db, t.uid, now)
    if (s.votes >= s.needed && !s.skipped && azuraConfigured()) {
      // Mark first so two people tipping it at once only skip one song.
      const ref = db.collection('skipVotes').doc(s.key)
      const won = await db.runTransaction(async tx => {
        if ((await tx.get(ref)).get('skipped') === true) return false
        tx.set(ref, { skipped: true, skippedAt: Timestamp.fromMillis(now), needed: s.needed, votes: s.votes }, { merge: true })
        return true
      })
      if (won) {
        try { await azSkip(); s = { ...s, skipped: true } }
        catch (e) { console.error('[vote skip]', e); await ref.set({ skipped: false }, { merge: true }) }
      }
    }
    return stripKey(s)
  })
}

function stripKey<T extends { key: string }>({ key: _k, ...rest }: T): Omit<T, 'key'> { void _k; return rest }
