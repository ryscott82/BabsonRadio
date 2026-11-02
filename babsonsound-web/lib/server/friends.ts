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

// The signed-in presence poll asks for the caller's friends every 30 s. The connection list and each friend's profile change
// rarely, so both are kept per server instance for a short time. Only friends who are tuned in are looked up at all.
const FRIEND_TTL = 30_000 // a friend's profile (name, invisible mode, Instagram)
const CONN_TTL = 180_000  // who the caller is connected to; longer than the poll interval, so most polls cost nothing
const connCache = new Map<string, { at: number; rows: { id: string; label: string }[] }>()
interface Prof { at: number; exists: boolean; invisible: boolean; guest: boolean; firstName: string; instagram: string }
const profCache = new Map<string, Prof>()
const PROFILE_FIELDS = ['invisible', 'level', 'instagram', 'firstName', 'displayName']
const MAX_CACHED = 5000

/** Forget cached friend data (used by tests, and available to anything that edits connections or visibility). */
export function resetFriendCaches() { connCache.clear(); profCache.clear() }

async function connectionRows(db: Firestore, uid: string, now: number) {
  const hit = connCache.get(uid)
  if (hit && now - hit.at < CONN_TTL) return hit.rows
  const conns = await db.collection('users').doc(uid).collection('connections').where('mutual', '==', true).get()
  const rows = conns.docs.map(d => ({ id: d.id, label: myLabel(d) }))
  if (connCache.size > MAX_CACHED) connCache.clear()
  connCache.set(uid, { at: now, rows })
  return rows
}

async function profilesOf(db: Firestore, ids: string[], now: number): Promise<Map<string, Prof>> {
  const out = new Map<string, Prof>(), need: string[] = []
  for (const id of ids) {
    const c = profCache.get(id)
    if (c && now - c.at < FRIEND_TTL) out.set(id, c); else need.push(id)
  }
  if (need.length) {
    if (profCache.size > MAX_CACHED) profCache.clear()
    for (const d of await db.getAll(...need.map(id => db.collection('users').doc(id)), { fieldMask: PROFILE_FIELDS })) {
      const ig = d.get('instagram')
      const p: Prof = {
        at: now, exists: d.exists, invisible: d.get('invisible') === true, guest: d.get('level') === 'guest',
        firstName: d.get('firstName') || d.get('displayName') || 'Friend', instagram: typeof ig === 'string' ? ig : '',
      }
      profCache.set(d.id, p); out.set(d.id, p)
    }
  }
  return out
}

/**
 * The same people (and the same caller-saved names) as visibleFriends, with the Instagram handle they added (or ''). Members in invisible mode are left out, and a
 * handle is never passed on for a Guest account. Only call this for a signed-in viewer who is not a Guest; the handle is not verified.
 * Pass `only` (the people tuned in) when the caller will throw everyone else away anyway: nobody else's profile is read then.
 */
export async function visibleFriendProfiles(db: Firestore, uid: string, only?: ReadonlySet<string>, now = Date.now()): Promise<Map<string, { firstName: string; instagram: string }>> {
  const rows = (await connectionRows(db, uid, now)).filter(r => !only || only.has(r.id))
  const out = new Map<string, { firstName: string; instagram: string }>()
  if (!rows.length) return out
  const profs = await profilesOf(db, rows.map(r => r.id), now)
  for (const r of rows) {
    const p = profs.get(r.id)
    if (!p || !p.exists || p.invisible) continue
    out.set(r.id, { firstName: r.label || p.firstName, instagram: p.guest ? '' : p.instagram })
  }
  return out
}
