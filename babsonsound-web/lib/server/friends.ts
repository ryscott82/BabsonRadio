import type { Firestore } from 'firebase-admin/firestore'

/**
 * People the viewer is connected to on the app (mutual contacts), minus anyone in invisible mode.
 * Map of uid → first name. This is the ONLY place names of other users are exposed, and only
 * to someone who already has them in their contacts and is connected.
 */
export async function visibleFriends(db: Firestore, uid: string): Promise<Map<string, string>> {
  const conns = await db.collection('users').doc(uid).collection('connections')
    .where('mutual', '==', true).get()
  const ids = conns.docs.map(d => d.id)
  const out = new Map<string, string>()
  if (!ids.length) return out
  const docs = await db.getAll(...ids.map(id => db.collection('users').doc(id)))
  for (const d of docs) {
    if (!d.exists || d.get('invisible') === true) continue
    out.set(d.id, d.get('firstName') ?? d.get('displayName') ?? 'Friend')
  }
  return out
}

/**
 * The same people as visibleFriends, with the Instagram handle they added (or ''). Members in invisible mode are left out, and a
 * handle is never passed on for a Guest account. Only call this for a signed-in viewer who is not a Guest; the handle is not verified.
 */
export async function visibleFriendProfiles(db: Firestore, uid: string): Promise<Map<string, { firstName: string; instagram: string }>> {
  const conns = await db.collection('users').doc(uid).collection('connections').where('mutual', '==', true).get()
  const ids = conns.docs.map(d => d.id)
  const out = new Map<string, { firstName: string; instagram: string }>()
  if (!ids.length) return out
  for (const d of await db.getAll(...ids.map(id => db.collection('users').doc(id)))) {
    if (!d.exists || d.get('invisible') === true) continue
    const ig = d.get('level') === 'guest' ? '' : d.get('instagram')
    out.set(d.id, { firstName: d.get('firstName') ?? d.get('displayName') ?? 'Friend', instagram: typeof ig === 'string' ? ig : '' })
  }
  return out
}
