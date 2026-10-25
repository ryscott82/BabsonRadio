import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { isOwnerEmail } from '@/lib/server/access'
import { deleteAccountData } from '@/lib/server/deleteAccount'

export const runtime = 'nodejs'

// Admin removes someone's account and everything stored about them. A typed reason is required and every deletion is
// written to accountDeletions (who, whom, why, when) BEFORE anything is removed, so the record exists even if the delete fails halfway.

// The log, newest first.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const snap = await adminDb().collection('accountDeletions').orderBy('at', 'desc').limit(200).get()
    return {
      log: snap.docs.map(d => ({
        id: d.id, email: d.get('email') ?? '', name: d.get('name') ?? '', level: d.get('level') ?? '', reason: d.get('reason') ?? '',
        by: d.get('byName') || d.get('byEmail') || '', at: d.get('at')?.toMillis?.() ?? 0, done: d.get('done') === true,
      })),
    }
  })
}

// { uid, reason, confirmed: true }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireAdmin(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128)
    const reason = str(b.reason, 500)
    if (!uid) throw new HttpError(400, 'Invalid request.')
    if (b.confirmed !== true) throw new HttpError(400, 'Confirmation missing.')
    if (reason.length < 10) throw new HttpError(400, 'Write a reason of at least 10 characters.')
    if (uid === me.uid) throw new HttpError(400, 'You cannot delete your own account here. Use Delete account on your profile.')

    const db = adminDb()
    const u = await db.collection('users').doc(uid).get()
    if (!u.exists) throw new HttpError(404, 'User not found.')
    const email = String(u.get('email') ?? '').toLowerCase()
    if (isOwnerEmail(email)) throw new HttpError(403, 'Owner accounts cannot be deleted.')
    if (u.get('demo') === true) throw new HttpError(403, 'The App Store reviewer account cannot be deleted.')

    const by = await db.collection('users').doc(me.uid).get()
    const log = db.collection('accountDeletions').doc()
    await log.set({
      uid, email, name: [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' '), level: u.get('level') ?? '',
      reason, byUid: me.uid, byEmail: me.email ?? '', byName: String(by.get('firstName') ?? ''), at: Timestamp.now(), done: false,
    })
    await deleteAccountData(uid)
    await log.update({ done: true })
    return { ok: true }
  })
}
