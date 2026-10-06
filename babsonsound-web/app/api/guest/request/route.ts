import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { ensureGuestUserDoc } from '@/lib/server/guests'

export const runtime = 'nodejs'

// A (non-Babson) guest, signed in via verified email link, asks a Babson student for access.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const email = (t.email ?? '').toLowerCase()
    if (!email || t.email_verified !== true) throw new HttpError(403, 'Verify your email first.')
    if (BABSON_EMAIL.test(email)) throw new HttpError(400, 'Babson students can sign in directly — no guest access needed.')

    const b = await readJson(req)
    const sponsorEmail = str(b.sponsorEmail, 200).toLowerCase()
    const name = str(b.name, 40) || 'Guest'
    if (!BABSON_EMAIL.test(sponsorEmail)) throw new HttpError(400, "Enter the Babson student's @babson.edu email.")

    const db = adminDb()
    const sponsorSnap = await db.collection('users').where('email', '==', sponsorEmail).limit(1).get()
    const sponsor = sponsorSnap.docs[0]
    const sponsorOk = sponsor && sponsor.get('accountType') === 'babson' &&
      (await adminAuth().getUser(sponsor.id)).emailVerified
    if (!sponsorOk) throw new HttpError(404, "We couldn't find a registered Babson student with that email.")

    await ensureGuestUserDoc(db, t.uid, email, name)

    const mine = (await db.collection('guestRequests').where('guestUid', '==', t.uid).get()).docs
    const dup = mine.find(d => d.get('sponsorUid') === sponsor.id && d.get('status') === 'pending')
    if (dup) return { id: dup.id }
    const recent = mine.filter(d => d.get('createdAt').toMillis() > Date.now() - 86_400_000)
    if (recent.length >= 5) throw new HttpError(429, 'Too many requests today. Try again tomorrow.')

    const ref = await db.collection('guestRequests').add({
      guestUid: t.uid, guestEmail: email, guestName: name,
      sponsorUid: sponsor.id, status: 'pending', createdAt: Timestamp.now(),
    })
    return { id: ref.id }
  })
}
