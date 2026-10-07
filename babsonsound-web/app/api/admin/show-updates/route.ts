import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { deleteImage } from '@/lib/server/images'

export const runtime = 'nodejs'

// Hosts' requested changes to their weekly shows. Approving applies them to the live schedule.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('showUpdates').where('status', '==', 'pending').get()
    const items = await Promise.all(snap.docs.map(async d => {
      const cur = await adminDb().collection('schedule').doc(d.get('scheduleId')).get()
      return {
        id: d.id, requesterName: d.get('requesterName') ?? '', createdAt: (d.get('createdAt') as Timestamp).toMillis(),
        current: { showName: cur.get('showName') ?? '', description: cur.get('description') ?? '', imageUrl: cur.get('imageUrl') ?? '' },
        requested: { showName: d.get('showName') ?? '', description: d.get('description') ?? '', imageUrl: d.get('imageUrl') ?? '' },
      }
    }))
    return { items: items.sort((a, b) => a.createdAt - b.createdAt) }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const id = str(b.id, 100)
    if (!id || (b.action !== 'approve' && b.action !== 'decline')) throw new HttpError(400, 'Invalid request.')
    const db = adminDb()
    const ref = db.collection('showUpdates').doc(id)
    const r = await ref.get()
    if (!r.exists || r.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')

    if (b.action === 'decline') {
      await deleteImage(r.get('imagePath'))
      await ref.update({ status: 'declined', decidedBy: t.uid, decidedAt: Timestamp.now() })
      return { ok: true }
    }
    const showRef = db.collection('schedule').doc(r.get('scheduleId'))
    const show = await showRef.get()
    if (!show.exists) throw new HttpError(404, 'That show no longer exists.')
    const patch: Record<string, unknown> = { updatedBy: t.uid }
    if (r.get('showName')) patch.showName = r.get('showName')
    if (r.get('description')) patch.description = r.get('description')
    if (r.get('imageUrl')) {
      if (show.get('imagePath') && show.get('imagePath') !== r.get('imagePath')) await deleteImage(show.get('imagePath'))
      patch.imageUrl = r.get('imageUrl'); patch.imagePath = r.get('imagePath')
    }
    await showRef.set(patch, { merge: true })
    await ref.update({ status: 'approved', decidedBy: t.uid, decidedAt: Timestamp.now() })
    return { ok: true }
  })
}
