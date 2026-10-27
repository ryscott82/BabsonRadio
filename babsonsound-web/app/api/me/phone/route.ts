import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { notifyAdmins } from '@/lib/server/push'
import { normalizeUS } from '@/lib/phone'
import { indexKeyFromE164 } from '@/lib/server/phone'
import { applyPhone, last4, removePhone } from '@/lib/server/phoneChange'

export const runtime = 'nodejs'

// A student's phone number (private: only the person themselves and admins ever see it).
//   POST { phone }   add one (applied at once when there is none) or ask to change it (an admin approves it in /admin/phone-changes)
//   POST { cancel }  withdraw a pending change   POST { remove }  take the number off the account
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const [u, r] = await Promise.all([db.collection('users').doc(t.uid).get(), db.collection('phoneChanges').doc(t.uid).get()])
    return {
      current: last4(u.get('phoneNumber')),
      pending: r.exists ? { last4: last4(r.get('newPhone')), at: (r.get('requestedAt') as Timestamp).toMillis() } : null,
    }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    if (b.remove === true) { await removePhone(adminDb(), t.uid); return { ok: true, current: '', pending: null } }
    if (b.cancel === true) { await adminDb().collection('phoneChanges').doc(t.uid).delete(); return { ok: true } }
    const phone = normalizeUS(str(b.phone, 30))
    if (!phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number.')
    const db = adminDb()
    const u = await db.collection('users').doc(t.uid).get()
    if (u.get('phoneNumber') === phone) throw new HttpError(400, 'That is already your number.')
    const hit = await db.collection('phoneIndex').doc(await indexKeyFromE164(phone)).get()
    if (hit.exists && hit.get('uid') !== t.uid) throw new HttpError(409, 'That phone number is already registered.')
    // No number on file yet (they skipped it at sign-up): add it straight away. Only a change needs an admin.
    if (!u.get('phoneNumber')) {
      await applyPhone(db, t.uid, phone)
      return { ok: true, applied: true, current: last4(phone) }
    }
    const name = [u.get('firstName') ?? '', u.get('lastName') ?? ''].join(' ').trim() || 'A student'
    await db.collection('phoneChanges').doc(t.uid).set({
      uid: t.uid, name, email: t.email ?? '', oldPhone: u.get('phoneNumber') ?? '', newPhone: phone, requestedAt: Timestamp.now(),
    })
    after(() => notifyAdmins('requests', { title: 'Phone number change', body: `${name} asked to change their phone number. Review in Phone changes.` }, t.uid))
    return { ok: true, pending: { last4: last4(phone), at: Date.now() } }
  })
}
