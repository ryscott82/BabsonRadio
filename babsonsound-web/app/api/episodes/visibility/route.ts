import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { assertAllAdults, recordConsent, revokeConsent } from '@/lib/server/publicContent'

export const runtime = 'nodejs'

// A host switches ONE episode between students-only (the default) and public: { episodeId, public, typedName, accepted, version }.
// Going public needs: the caller is a host of the episode, every host is a known adult, and the signed agreement.
// Going back to private needs no signature and works for a host or any admin.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const id = str(b.episodeId, 100)
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Bad episode.')
    const db = adminDb()
    const ref = db.collection('episodes').doc(id)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpError(404, 'Episode not found.')
    const hostUids = (snap.get('hostUids') as string[] | undefined) ?? []
    const isHost = hostUids.includes(t.uid)

    if (b.public !== true) {
      const level = isHost ? '' : (await accessOf(t)).level
      if (!isHost && level !== 'admin' && level !== 'director') throw new HttpError(403, 'Only a host of this episode can change that.', 'BR-PUB-005')
      await ref.update({ visibility: 'private', publicConsentId: null, madePrivateAt: Timestamp.now() })
      await revokeConsent(db, snap.get('publicConsentId'))
      return { ok: true, visibility: 'private' }
    }

    if (!isHost) throw new HttpError(403, 'Only a host of this episode can make it public.', 'BR-PUB-005')
    await assertAllAdults(db, hostUids) // one minor or unknown host blocks it
    const consentId = await recordConsent(db, t, b as never, { kind: 'episode', id, title: String(snap.get('title') ?? '') })
    await ref.update({ visibility: 'public', publicConsentId: consentId, madePublicAt: Timestamp.now() })
    return { ok: true, visibility: 'public' }
  })
}
