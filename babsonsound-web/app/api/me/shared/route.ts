import { adminDb } from '@/lib/server/admin'
import { handle, requireUser } from '@/lib/server/http'
import { otherPhoneUsers, phoneHashOf } from '@/lib/server/phoneStore'

export const runtime = 'nodejs'

// How many OTHER members use the same phone number or Instagram handle as you. Counts only: never who, never the number.
// Shown on your own profile page as a warning, so you can fix a typo or tell us if someone is using your details.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const db = adminDb()
    const u = await db.collection('users').doc(t.uid).get()
    const handleName = String(u.get('instagram') ?? '')
    const [phone, insta] = await Promise.all([
      otherPhoneUsers(db, t.uid, await phoneHashOf(u)),
      handleName ? db.collection('users').where('instagram', '==', handleName).count().get().then(s => Math.max(0, s.data().count - 1)) : 0,
    ])
    return { phone, instagram: insta }
  }, { 'Cache-Control': 'no-store' })
}
