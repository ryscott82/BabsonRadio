import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireUser } from '@/lib/server/http'
import { bump } from '@/lib/server/earnedEmojis'
import { applySkipIfReady, azuraConfigured, forgetSkipDoc, skipState } from '@/lib/server/skipVotes'
import { PRESENCE_TTL_MS } from '@/lib/liveBundle'
import { forgetOld, oldPoll } from '@/lib/server/oldRoute'
import { throttled } from '@/lib/server/tierGate'
import { publishNow } from '@/lib/server/liveStateTick'

export const runtime = 'nodejs'

// What a throttled or switched-off skip answers: "nothing to skip right now", never an error.
const EMPTY = { eligible: false, votes: 0, needed: 0, listeners: 0, mine: false, skipped: false }

// Older apps poll this: one person asking again within 30 s gets the last answer (lib/server/oldRoute.ts). The web page reads the bundle
// and the pushed liveState document instead.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    return throttled('skip', t.uid, EMPTY, () => oldPoll('skip', t.uid, async () => {
      const db = adminDb()
      let s = await skipState(db, t.uid)
      try { s = await applySkipIfReady(db, s) } catch { /* the vote still stands; the next poll tries again */ }
      return stripKey(s)
    }))
  }, { 'Cache-Control': 'private, no-store' })
}

// Ask to skip the song that is playing (auto DJ only). Needs you to be tuned in. At 90% of listeners, it skips.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    return throttled('skip', t.uid, EMPTY, () => skipNow(t.uid), 'w')
  })
}

async function skipNow(uid: string) {
  const db = adminDb()
  const now = Date.now()
  let s = await skipState(db, uid, now)
  if (!s.eligible) throw new HttpError(409, 'Songs can only be skipped when the station is playing its own music, not during a live show.')
  const me = await db.collection('presence').doc(uid).get()
  const fresh = (me.get('updatedAt') as Timestamp | undefined)?.toMillis() ?? 0
  if (me.get('isListening') !== true || now - fresh > PRESENCE_TTL_MS) throw new HttpError(403, 'Press play first. Only people listening can ask to skip.')
  if (s.skipped) return { ...stripKey(s), skipped: true }

  await db.collection('skipVotes').doc(s.key).set({ voters: FieldValue.arrayUnion(uid), at: Timestamp.fromMillis(now) }, { merge: true })
  forgetSkipDoc(s.key)
  await bump(db, uid)
  s = await skipState(db, uid, now)
  if (s.votes >= s.needed && !s.skipped && !azuraConfigured()) {
    throw new HttpError(503, 'Skipping is not connected to the radio yet. Tell the station team.', 'BR-HST-003')
  }
  try { s = await applySkipIfReady(db, s, now) }
  catch { throw new HttpError(502, 'Enough people asked, but the radio did not accept the skip. Tell the station team (AzuraCast key needs "Manage station broadcasting").', 'BR-HST-003') }
  forgetOld('skip', uid)
  after(() => publishNow(db, now).then(() => undefined).catch(() => {})) // the new tally goes to everyone's page
  return stripKey(s)
}

function stripKey<T extends { key: string }>({ key: _k, ...rest }: T): Omit<T, 'key'> { void _k; return rest }
