import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, isDeveloperToken, readJson, requireStaff, str } from '@/lib/server/http'

export const runtime = 'nodejs'

// listener < showHost < superAdmin ("Admin") < developer. Admins manage listeners and hosts; only a developer
// can create or remove admins and developers.
const ROLES = ['listener', 'showHost', 'superAdmin', 'developer'] as const
const PRIVILEGED = ['superAdmin', 'developer']

// Everyone with an account (newest first), for the admin Users page.
export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireStaff(req)
    const snap = await adminDb().collection('users').orderBy('joinedAt', 'desc').limit(500).get()
    return {
      canManageAdmins: isDeveloperToken(me),
      users: snap.docs.filter(d => d.id !== 'preview-developer').map(d => ({
        id: d.id,
        name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim(),
        username: d.get('username') ?? '',
        email: d.get('email') ?? '',
        role: d.get('role') ?? 'listener',
        accountType: d.get('accountType') ?? '',
        betaTester: d.get('betaTester') === true,
      })),
    }
  })
}

// Change someone's role: { uid, role: 'listener' | 'showHost' | 'superAdmin' | 'developer' }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireStaff(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128)
    const role = str(b.role, 20)
    if (!uid || !(ROLES as readonly string[]).includes(role)) throw new HttpError(400, 'Invalid request.')
    if (uid === me.uid) throw new HttpError(400, 'You cannot change your own role.')
    const ref = adminDb().collection('users').doc(uid)
    const u = await ref.get()
    if (!u.exists) throw new HttpError(404, 'User not found.')
    // Only student accounts (Babson, Olin or Wellesley) can be hosts or admins, never guests.
    if (!BABSON_EMAIL.test(String(u.get('email') ?? '').toLowerCase())) {
      throw new HttpError(400, 'Only students with a school email can be hosts or admins.')
    }
    // Developer status is a sign-in claim (it is what the rules and the server trust), so read it from the account.
    const authUser = await adminAuth().getUser(uid)
    const claims = authUser.customClaims ?? {}
    const currentIsDev = claims.developer === true
    const current = currentIsDev ? 'developer' : String(u.get('role') ?? 'listener')
    if (!isDeveloperToken(me) && (PRIVILEGED.includes(role) || PRIVILEGED.includes(current))) {
      throw new HttpError(403, 'Only a developer can change who is an admin or developer.')
    }
    if (role === 'developer') await adminAuth().setCustomUserClaims(uid, { ...claims, developer: true })
    else if (currentIsDev) {
      const { developer: _drop, ...rest } = claims
      void _drop
      await adminAuth().setCustomUserClaims(uid, rest)
    }
    await ref.update({ role })
    return { ok: true, note: role === 'developer' || currentIsDev ? 'They need to sign out and back in for this to take effect.' : undefined }
  })
}
