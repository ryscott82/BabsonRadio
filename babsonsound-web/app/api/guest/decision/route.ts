import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireBabson, str } from '@/lib/server/http'
import { assertSponsorCapacity, isDuration, passData } from '@/lib/server/guests'

export const runtime = 'nodejs'

// The sponsoring Babson student approves (with a duration) or denies a guest's request.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireBabson(req)
    const b = await readJson(req)
    const requestId = str(b.requestId, 100)
    const action = b.action
    if (!requestId || (action !== 'approve' && action !== 'deny')) throw new HttpError(400, 'Invalid request.')

    const db = adminDb()
    const reqRef = db.collection('guestRequests').doc(requestId)

    if (action === 'approve') {
      if (!isDuration(b.duration)) throw new HttpError(400, 'Pick how long the guest gets access.')
      const duration = b.duration
      const first = await reqRef.get()
      if (!first.exists || first.get('sponsorUid') !== t.uid) throw new HttpError(404, 'Request not found.')
      await assertSponsorCapacity(db, t.uid, first.get('guestUid'))
      const sponsor = await db.collection('users').doc(t.uid).get()

      return db.runTransaction(async tx => {
        const r = await tx.get(reqRef)
        if (r.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')
        const pass = passData({
          guestEmail: r.get('guestEmail'), sponsorUid: t.uid,
          sponsorName: sponsor.get('firstName') ?? 'A Babson student', duration,
        })
        tx.set(db.collection('guestPasses').doc(r.get('guestUid')), pass)
        tx.update(reqRef, { status: 'approved', duration, decidedAt: Timestamp.now() })
        return { ok: true, expiresAt: (pass.expiresAt as Timestamp).toMillis() }
      })
    }

    return db.runTransaction(async tx => {
      const r = await tx.get(reqRef)
      if (!r.exists || r.get('sponsorUid') !== t.uid) throw new HttpError(404, 'Request not found.')
      if (r.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')
      tx.update(reqRef, { status: 'denied', decidedAt: Timestamp.now() })
      return { ok: true }
    })
  })
}
