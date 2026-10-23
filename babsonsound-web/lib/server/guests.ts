import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { requireStudent } from './http'
import { accessOf } from './access'

export async function ensureGuestUserDoc(db: Firestore, uid: string, email: string, name: string) {
  const ref = db.collection('users').doc(uid)
  const snap = await ref.get()
  if (snap.exists) return
  await ref.set({
    firstName: name, displayName: name, email, level: 'guest', studioTrained: false, radioTrained: false, accountType: 'guest',
    notifyNewEpisode: [], notifyGoesLive: [], joinedAt: Timestamp.now(),
  })
}

/** The Library is for students and above. Guests (sponsored or not) get live radio only. */
export const requireLibrary = requireStudent

/** Same test as requireLibrary, as a yes/no. */
export async function canUseLibrary(t: import('firebase-admin/auth').DecodedIdToken): Promise<boolean> {
  return (await accessOf(t)).level !== 'guest'
}
