import { adminAuth, adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { forgetEarlyAccess } from '@/lib/server/launchAccess'

export const runtime = 'nodejs'

// Before the launch time, developers, admins, directors, show hosts, beta testers and hosts in training get in on their own.
// This is for anyone else you want inside early: GET lists them; POST { email, grant: true | false } changes one person.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('users').where('earlyAccess', '==', true).get()
    return { people: snap.docs.map(d => ({ uid: d.id, email: d.get('email') ?? '', name: [d.get('firstName'), d.get('lastName')].filter(Boolean).join(' ') })) }
  }, { 'Cache-Control': 'no-store' })
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const email = str(b.email, 200).toLowerCase()
    if (!email || typeof b.grant !== 'boolean') throw new HttpError(400, 'Send { email, grant: true | false }.')
    let uid: string
    try { uid = (await adminAuth().getUserByEmail(email)).uid } catch { throw new HttpError(404, 'No account has that email.') }
    await adminDb().collection('users').doc(uid).set({ earlyAccess: b.grant }, { merge: true })
    forgetEarlyAccess(uid)
    return { ok: true, uid }
  }, { 'Cache-Control': 'no-store' })
}
