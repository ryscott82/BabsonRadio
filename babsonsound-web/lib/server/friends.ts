import type { Firestore } from 'firebase-admin/firestore'
import { decryptJson } from './pii'

/**
 * The name the CALLER saved for a friend in their own contacts (users/{me}/connections/{friend}.contactName, encrypted), or ''.
 * It sits on the caller's own connection doc and is never read for anyone else, so one member's label can't reach another.
 */
function myLabel(conn: FirebaseFirestore.QueryDocumentSnapshot): string {
  const enc = conn.get('contactName')
  if (typeof enc !== 'string' || !enc) return ''
  try { const v = decryptJson<string>(enc); return typeof v === 'string' ? v : '' } catch { return '' }
}

/**
 * People the viewer is connected to on the app (mutual contacts), minus anyone in invisible mode.
 * Map of uid → the name the viewer saved for them in their own contacts, or their first name when there is none.
 * This is the ONLY place names of other users are exposed, and only to someone who already has them in their contacts
 * and is connected. (The admin friends map reads account names itself and does not use this.)
 */
export async function visibleFriends(db: Firestore, uid: string): Promise<Map<string, string>> {
  const conns = await db.collection('users').doc(uid).collection('connections')
    .where('mutual', '==', true).get()
  const ids = conns.docs.map(d => d.id)
  const labels = new Map(conns.docs.map(d => [d.id, myLabel(d)]))
  const out = new Map<string, string>()
  if (!ids.length) return out
  const docs = await db.getAll(...ids.map(id => db.collection('users').doc(id)))
  for (const d of docs) {
    if (!d.exists || d.get('invisible') === true) continue
    out.set(d.id, labels.get(d.id) || d.get('firstName') || d.get('displayName') || 'Friend')
  }
  return out
}

/**
 * The same people (and the same caller-saved names) as visibleFriends, with the Instagram handle they added (or ''). Members in invisible mode are left out, and a
 * handle is never passed on for a Guest account. Only call this for a signed-in viewer who is not a Guest; the handle is not verified.
 */
export async function visibleFriendProfiles(db: Firestore, uid: string): Promise<Map<string, { firstName: string; instagram: string }>> {
  const conns = await db.collection('users').doc(uid).collection('connections').where('mutual', '==', true).get()
  const ids = conns.docs.map(d => d.id)
  const labels = new Map(conns.docs.map(d => [d.id, myLabel(d)]))
  const out = new Map<string, { firstName: string; instagram: string }>()
  if (!ids.length) return out
  for (const d of await db.getAll(...ids.map(id => db.collection('users').doc(id)))) {
    if (!d.exists || d.get('invisible') === true) continue
    const ig = d.get('level') === 'guest' ? '' : d.get('instagram')
    out.set(d.id, { firstName: labels.get(d.id) || d.get('firstName') || d.get('displayName') || 'Friend', instagram: typeof ig === 'string' ? ig : '' })
  }
  return out
}
