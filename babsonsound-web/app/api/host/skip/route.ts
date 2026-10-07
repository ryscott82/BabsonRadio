import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { requireOnAir } from '@/lib/server/host'
import { azSkip, azuraConfigured } from '@/lib/server/azuracast'

export const runtime = 'nodejs'

// Skip to the next song. Only inside the 4-hour window around your show (staff any time). Every use is logged.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const c = await requireOnAir(req, db)
    if (!azuraConfigured()) throw new HttpError(503, 'The radio controls are not connected yet.', 'BR-HST-003')

    // One skip every 8 seconds per person, so a double tap does not skip two songs.
    const rate = db.collection('hostRate').doc(c.t.uid)
    const last = (await rate.get()).get('lastSkipAt') as Timestamp | undefined
    if (last && Date.now() - last.toMillis() < 8000) throw new HttpError(429, 'Wait a few seconds before skipping again.')
    await rate.set({ lastSkipAt: Timestamp.now() })
    try { await azSkip() }
    catch (e) {
      console.error('[host skip]', e)
      throw new HttpError(502, 'The radio did not accept the skip. Try again in a moment.', 'BR-HST-003')
    }
    await db.collection('hostActions').add({ uid: c.t.uid, action: 'skip', show: c.open[0]?.title ?? '(staff)', at: Timestamp.now() })
    return { ok: true }
  })
}
