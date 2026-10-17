import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { friendInviteMail, mailConfigured, sendMail } from '@/lib/server/mailer'
import { adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, readJson, requireBabson, str } from '@/lib/server/http'
import { assertSponsorCapacity, isDuration } from '@/lib/server/guests'
import { sha256Hex } from '@/lib/phone'

export const runtime = 'nodejs'

// A Babson student pre-approves a guest email. The pass starts when the guest first signs in.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireBabson(req)
    const b = await readJson(req)
    const guestEmail = str(b.guestEmail, 200).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) throw new HttpError(400, 'Enter a valid email address.')
    if (BABSON_EMAIL.test(guestEmail)) throw new HttpError(400, 'Babson students already have access.')
    if (!isDuration(b.duration)) throw new HttpError(400, 'Pick a duration.')

    const db = adminDb()
    await assertSponsorCapacity(db, t.uid)
    const sponsor = await db.collection('users').doc(t.uid).get()
    const firstName: string = sponsor.get('firstName') ?? 'A Babson student'
    await db.collection('guestInvites').doc(await sha256Hex(guestEmail)).set({
      guestEmail, sponsorUid: t.uid, sponsorName: firstName,
      duration: b.duration, createdAt: Timestamp.now(),
      inviteExpiresAt: Timestamp.fromMillis(Date.now() + 14 * 86_400_000),
    })
    // The station sends the email on the student's behalf.
    const mail = friendInviteMail({ firstName, email: guestEmail })
    after(() => sendMail(guestEmail, mail.subject, mail.text, mail.html))
    return { ok: true, emailed: mailConfigured() }
  })
}
