import 'server-only'
import type { Firestore, Query } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from './admin'
import { indexKeyFromE164 } from './phone'
import { removeContactGraph } from './contactGraph'

async function deleteQuery(db: Firestore, q: Query) {
  const snap = await q.get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch()
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

/** Permanently removes a person's account and everything stored about them (used by "delete my account" and for under-13s). */
export async function deleteAccountData(uid: string) {
    const db = adminDb()
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
      db.collection('guestLinks').doc(uid).delete(),
      db.collection('contactSyncs').doc(uid).delete(),
      userRef.delete(),
    ])
    await adminAuth().deleteUser(uid)
}
