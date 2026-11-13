import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireBoothCaller } from '@/lib/server/booth'

export const runtime = 'nodejs'

// Someone at the studio PC who has no account types their email and watches the equipment training: { email }.
// Saved once per email in boothGuests (server only), counting how many times they came back. No marketing without the box.
// Needs the studio PC's signed nonce (x-booth-nonce and x-booth-sig headers).
export async function POST(req: Request) {
  return handle(async () => {
    await requireBoothCaller(req)
    const b = await readJson(req)
    const email = str(b.email, 200).trim().toLowerCase()
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'That doesn’t look like an email address.')
    const ref = adminDb().collection('boothGuests').doc(createHash('sha256').update(email).digest('hex').slice(0, 40))
    const now = Timestamp.now()
    await adminDb().runTransaction(async tx => {
      const cur = await tx.get(ref)
      if (cur.exists) tx.update(ref, { lastAt: now, visits: (Number(cur.get('visits')) || 1) + 1, ...(b.updates === true ? { updates: true } : {}) })
      else tx.set(ref, { email, firstAt: now, lastAt: now, visits: 1, watchedTraining: true, updates: b.updates === true })
    })
    return { ok: true, trainingVideoId: process.env.BOOTH_TRAINING_VIDEO_ID ?? '' }
  }, { 'Cache-Control': 'private, no-store' })
}
