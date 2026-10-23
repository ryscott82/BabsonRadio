import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { forgetAccess } from '@/lib/server/access'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { TRAINING_VERSION } from '@/lib/training'
import { CHECKIN_VALID_MS } from '@/lib/server/conduct'

export const runtime = 'nodejs'

// Who is trained, who asked for training, and a quick way to certify or revoke by hand (for example after in-person training).
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const db = adminDb()
    const [users, tr] = await Promise.all([
      db.collection('users').orderBy('joinedAt', 'desc').limit(1000).get(),
      db.collection('training').get(),
    ])
    const byUid = new Map(tr.docs.map(d => [d.id, d]))
    const ms = (v: unknown) => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null
    const rows = users.docs.filter(d => d.id !== 'preview-developer' && /@(babson|olin|wellesley)\.edu$/i.test(String(d.get('email') ?? ''))).map(d => {
      const t = byUid.get(d.id)
      const certifiedAt = ms(t?.get('certifiedAt'))
      return {
        uid: d.id,
        name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim(),
        email: d.get('email') ?? '', level: d.get('level') ?? 'student',
        trained: d.get('radioTrained') === true, studioTrained: d.get('studioTrained') === true,
        certifiedAt, certifiedBy: t?.get('certifiedBy') ?? '', score: t?.get('score') ?? null, attempts: t?.get('attempts') ?? 0,
        requestedAt: certifiedAt == null ? ms(t?.get('requestedAt')) : null, requestNote: t?.get('requestNote') ?? '',
        conductSigned: d.get('conductVersion') != null,
        checkInAt: (() => { const at = ms(t?.get('checkInAt')), ok = ms(t?.get('checkInApprovedAt')); return at && (!ok || ok < at) && Date.now() - at < CHECKIN_VALID_MS ? at : null })(),
      }
    })
    return { users: rows }
  })
}

// { uid, action: 'certify' | 'revoke' | 'clearRequest' | 'approveCheckin' }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireDirector(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128), action = str(b.action, 20)
    if (!uid) throw new HttpError(400, 'Pick a person.')
    const ref = adminDb().collection('training').doc(uid)
    const now = Timestamp.now()
    const user = adminDb().collection('users').doc(uid)
    if (action === 'certify') {
      await ref.set({ certifiedAt: now, revokedAt: null, version: TRAINING_VERSION, certifiedBy: me.email ?? me.uid, requestedAt: null }, { merge: true })
      await user.update({ radioTrained: true, studioTrained: true }) // the badges are what the server checks
    } else if (action === 'revoke') {
      await ref.set({ revokedAt: now }, { merge: true })
      await user.update({ radioTrained: false, studioTrained: false })
    }
    else if (action === 'approveCheckin') await ref.set({ checkInApprovedAt: now, checkInApprovedBy: me.email ?? me.uid, requestedAt: null }, { merge: true })
    else if (action === 'clearRequest') await ref.set({ requestedAt: null }, { merge: true })
    else throw new HttpError(400, 'Unknown action.')
    forgetAccess(uid)
    return { ok: true }
  })
}
