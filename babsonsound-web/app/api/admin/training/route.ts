import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { TRAINING_VERSION } from '@/lib/training'

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
      const certifiedAt = ms(t?.get('certifiedAt')), revokedAt = ms(t?.get('revokedAt'))
      return {
        uid: d.id,
        name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim(),
        email: d.get('email') ?? '', role: d.get('role') ?? 'listener',
        trained: certifiedAt != null && revokedAt == null,
        certifiedAt, certifiedBy: t?.get('certifiedBy') ?? '', score: t?.get('score') ?? null, attempts: t?.get('attempts') ?? 0,
        requestedAt: certifiedAt == null ? ms(t?.get('requestedAt')) : null, requestNote: t?.get('requestNote') ?? '',
        conductSigned: d.get('conductVersion') != null,
      }
    })
    return { users: rows }
  })
}

// { uid, action: 'certify' | 'revoke' | 'clearRequest' }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireDirector(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128), action = str(b.action, 20)
    if (!uid) throw new HttpError(400, 'Pick a person.')
    const ref = adminDb().collection('training').doc(uid)
    const now = Timestamp.now()
    if (action === 'certify') await ref.set({ certifiedAt: now, revokedAt: null, version: TRAINING_VERSION, certifiedBy: me.email ?? me.uid, requestedAt: null }, { merge: true })
    else if (action === 'revoke') await ref.set({ revokedAt: now }, { merge: true })
    else if (action === 'clearRequest') await ref.set({ requestedAt: null }, { merge: true })
    else throw new HttpError(400, 'Unknown action.')
    return { ok: true }
  })
}
