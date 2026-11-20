import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, requireArts, str } from '@/lib/server/http'
import { LEVELS, forgetAccess, inviteKey, isOwnerEmail, rank, type Level } from '@/lib/server/access'

export const runtime = 'nodejs'

// The BabsonARTS Settings menu: who is staff. BabsonARTS staff and Admins can see the staff list and ADD people as BabsonARTS staff, E-board members or Admins.
// Taking a role away stays in the admin Users page (Admins only), and nobody's level goes down from here.
const ADDABLE: Level[] = ['arts', 'director', 'admin']

export async function GET(req: Request) {
  return handle(async () => {
    await requireArts(req)
    const db = adminDb()
    const [snap, inv] = await Promise.all([db.collection('users').where('level', 'in', ADDABLE).limit(200).get(), db.collection('roleInvites').get()])
    return {
      staff: snap.docs.map(d => ({ id: d.id, name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim(), email: String(d.get('email') ?? ''), level: String(d.get('level')) }))
        .sort((a, b) => rank(b.level as Level) - rank(a.level as Level) || a.name.localeCompare(b.name)),
      invites: inv.docs.filter(d => ADDABLE.includes(d.get('level'))).map(d => ({ email: String(d.get('email') ?? ''), level: String(d.get('level')) })),
    }
  }, { 'Cache-Control': 'private, no-store' })
}

// { email, level: 'arts' | 'director' | 'admin' }. A person with an account gets the role now (it gives nothing until their email is verified);
// an email with no account yet is saved as an invite that applies when they sign up.
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireArts(req)
    const b = await readJson(req)
    const email = str(b.email, 200).toLowerCase(), level = str(b.level, 20) as Level
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    if (!ADDABLE.includes(level)) throw new HttpError(400, 'Pick BabsonARTS, E-board or Admin.')
    if (isOwnerEmail(email)) throw new HttpError(403, 'Owner accounts cannot be changed.')
    const db = adminDb()
    const found = await db.collection('users').where('email', '==', email).limit(1).get()
    if (found.empty) {
      const iref = db.collection('roleInvites').doc(inviteKey(email))
      const prev = await iref.get()
      if (prev.exists && LEVELS.indexOf(prev.get('level')) > LEVELS.indexOf(level)) throw new HttpError(409, 'They already have a higher role waiting.')
      await iref.set({
        email, level, studioTrained: prev.get('studioTrained') === true, radioTrained: prev.get('radioTrained') === true,
        createdBy: me.email ?? me.uid, createdAt: prev.get('createdAt') ?? Timestamp.now(),
      })
      return { ok: true, invited: true }
    }
    const ref = found.docs[0].ref
    const u = found.docs[0]
    if (u.id === me.uid) throw new HttpError(400, 'You cannot change your own level.')
    if (rank(String(u.get('level')) as Level) > rank(level)) throw new HttpError(409, 'They already have a higher role. Only an Admin can change that, from the Users page.')
    const update: Record<string, unknown> = { level, role: FieldValue.delete() }
    const authUser = await adminAuth().getUser(u.id)
    if (!authUser.emailVerified) update.roleNeedsVerify = true
    await ref.update(update)
    forgetAccess(u.id)
    await db.collection('hostActions').add({ uid: me.uid, action: 'staff-add', show: '(arts settings)', detail: `${email} -> ${level}`.slice(0, 160), at: Timestamp.now() }).catch(() => {})
    return { ok: true }
  })
}
