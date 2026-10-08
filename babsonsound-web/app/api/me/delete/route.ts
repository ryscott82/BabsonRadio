import type { Firestore, Query } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser } from '@/lib/server/http'
import { indexKeyFromE164 } from '@/lib/server/phone'
import { removeContactGraph } from '@/lib/server/contactGraph'

export const runtime = 'nodejs'

async function deleteQuery(db: Firestore, q: Query) {
  const snap = await q.get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch()
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

// Permanently deletes the caller's account and their data. Requires a fresh sign-in
// (the apps ask for the password first) and { confirm: "DELETE" }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await readJson(req)).confirm !== 'DELETE') throw new HttpError(400, 'Confirmation missing.')
    if (!t.auth_time || t.auth_time < Date.now() / 1000 - 300) {
      throw new HttpError(401, 'Please sign in again to delete your account.')
    }

    const db = adminDb()
    const uid = t.uid
    const userRef = db.collection('users').doc(uid)
    const user = await userRef.get()

    const phone = user.get('phoneNumber')
    if (phone) await db.collection('phoneIndex').doc(await indexKeyFromE164(phone)).delete()

    await removeContactGraph(db, uid).catch(() => {}) // take this person's saved numbers back out of the counts
    await db.collection('contactGraph').doc(uid).delete()
    await deleteQuery(db, userRef.collection('connections'))
    await deleteQuery(db, db.collection('slotRequests').where('requesterUid', '==', uid))
    await deleteQuery(db, db.collection('airSlots').where('requesterUid', '==', uid))
    await deleteQuery(db, db.collection('guestRequests').where('guestUid', '==', uid))
    await deleteQuery(db, db.collection('guestRequests').where('sponsorUid', '==', uid))
    await deleteQuery(db, db.collection('guestInvites').where('sponsorUid', '==', uid))
    await deleteQuery(db, db.collection('likes').where('uid', '==', uid))
    await Promise.all([
      db.collection('presence').doc(uid).delete(),
      db.collection('guestPasses').doc(uid).delete(),
      db.collection('guestTrials').doc(uid).delete(),
      db.collection('contactSyncs').doc(uid).delete(),
      userRef.delete(),
    ])
    await adminAuth().deleteUser(uid)
    return { ok: true }
  })
}
