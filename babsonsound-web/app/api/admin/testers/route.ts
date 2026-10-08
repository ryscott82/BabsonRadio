import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { adminAuth } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { after } from 'next/server'
import { normEmail, testerEmails, welcomeTesters } from '@/lib/server/testers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const pend = await adminDb().collection('users').where('betaStatus', '==', 'pending').get()
    const requests = pend.docs.map(d => ({
      uid: d.id, email: d.get('email') ?? '', name: [d.get('firstName'), d.get('lastName')].filter(Boolean).join(' '),
      joinedAt: d.get('joinedAt')?.toMillis?.() ?? 0,
    })).sort((a, b) => b.joinedAt - a.joinedAt)
    return { emails: await testerEmails(), requests }
  })
}

// Approve or deny someone who signed up without being on the list: { uid, decision: 'approve' | 'deny' }
export async function PUT(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128)
    if (!uid || (b.decision !== 'approve' && b.decision !== 'deny')) throw new HttpError(400, 'Invalid request.')
    const ref = adminDb().collection('users').doc(uid)
    const u = await ref.get()
    if (!u.exists || u.get('betaStatus') !== 'pending') throw new HttpError(404, 'No pending request for that account.')
    if (b.decision === 'deny') { await ref.update({ betaStatus: 'denied' }); return { ok: true } }
    const email = normEmail(String(u.get('email') ?? ''))
    await adminDb().collection('config').doc('betaTesters').set({ emails: FieldValue.arrayUnion(email) }, { merge: true })
    const claims = (await adminAuth().getUser(uid)).customClaims ?? {}
    await adminAuth().setCustomUserClaims(uid, { ...claims, tester: true })
    await ref.update({ betaStatus: 'approved', betaTester: true, accountType: 'babson' })
    if (b.welcome !== false) after(() => welcomeTesters([email]).catch(() => null))
    return { ok: true }
  })
}

// Add or remove one or more emails: { emails: ["a@babson.edu", ...], on: true | false }
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const raw = Array.isArray(b.emails) ? b.emails : []
    const emails = [...new Set(raw.map(e => normEmail(str(e, 200))).filter(Boolean))]
    if (!emails.length || emails.length > 200 || typeof b.on !== 'boolean') throw new HttpError(400, 'Invalid request.')
    const bad = emails.find(e => !ANY_EMAIL.test(e))
    if (bad) throw new HttpError(400, `${bad} is not a valid email address.`)
    await adminDb().collection('config').doc('betaTesters').set(
      { emails: b.on ? FieldValue.arrayUnion(...emails) : FieldValue.arrayRemove(...emails) }, { merge: true })
    // New testers get the "you've been selected" email unless the box was unticked. Each address is only ever emailed once.
    if (b.on && b.welcome !== false) {
      const { mailConfigured } = await import('@/lib/server/mailer')
      after(() => welcomeTesters(emails).catch(() => null))
      return { emails: await testerEmails(), mail: mailConfigured() ? 'sending' : 'not-set-up' }
    }
    return { emails: await testerEmails() }
  })
}
