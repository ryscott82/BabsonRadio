import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, requireUser } from '@/lib/server/http'
import { assertSponsorCapacity, ensureGuestUserDoc, passData } from '@/lib/server/guests'
import { sha256Hex } from '@/lib/phone'

export const runtime = 'nodejs'

// Called after a guest signs in: redeems a student's pre-approved invite for their email.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const email = (t.email ?? '').toLowerCase()
    if (!email || t.email_verified !== true) throw new HttpError(403, 'Verify your email first.')
    if (BABSON_EMAIL.test(email)) return { granted: false }

    const db = adminDb()
    const inviteRef = db.collection('guestInvites').doc(await sha256Hex(email))
    const invite = await inviteRef.get()
    if (!invite.exists) return { granted: false }
    if (invite.get('inviteExpiresAt').toMillis() < Date.now()) {
      await inviteRef.delete()
      return { granted: false }
    }

    await assertSponsorCapacity(db, invite.get('sponsorUid'), t.uid)
    await ensureGuestUserDoc(db, t.uid, email, 'Guest')
    const pass = passData({
      guestEmail: email, sponsorUid: invite.get('sponsorUid'),
      sponsorName: invite.get('sponsorName'), duration: invite.get('duration'),
    })
    const batch = db.batch()
    batch.set(db.collection('guestPasses').doc(t.uid), pass)
    batch.delete(inviteRef)
    await batch.commit()
    return { granted: true, expiresAt: (pass.expiresAt as Timestamp).toMillis() }
  })
}
