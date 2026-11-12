import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireDirector } from '@/lib/server/http'
import { shapeProfile, type ProfileSlot } from '@/lib/userProfile'

export const runtime = 'nodejs'

// One person's profile for staff (E-board and Admin): name, role, training and their show requests. No email, phone or Instagram.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const uid = new URL(req.url).searchParams.get('uid') ?? ''
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpError(400, 'Pick a person first.')
    const db = adminDb()
    const [u, slots] = await Promise.all([db.collection('users').doc(uid).get(), db.collection('slotRequests').where('requesterUid', '==', uid).get()])
    if (!u.exists || u.get('demo') === true) throw new HttpError(404, 'That person was not found.')
    const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : null)
    const rows: ProfileSlot[] = slots.docs.map(d => ({ id: d.id, title: String(d.get('title') ?? ''), startAt: ms(d.get('startAt')) ?? 0, type: String(d.get('type') ?? ''), status: String(d.get('status') ?? '') }))
    return shapeProfile({
      firstName: u.get('firstName'), displayName: u.get('displayName'), lastName: u.get('lastName'), gradYear: u.get('gradYear') ? String(u.get('gradYear')) : '', level: u.get('level'),
      radioTrained: u.get('radioTrained') === true, radioExpiresAt: ms(u.get('radioExpiresAt')), studioTrained: u.get('studioTrained') === true, studioExpiresAt: ms(u.get('studioExpiresAt')),
    }, rows, Date.now())
  })
}
