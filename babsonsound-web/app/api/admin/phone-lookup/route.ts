import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { normalizeUS } from '@/lib/phone'
import { indexKeyFromE164 } from '@/lib/server/phone'

export const runtime = 'nodejs'

// Admins only (not directors). Type a number, see which account has it. Every lookup is logged to phoneLookups
// (who looked, last 4 digits, found or not, when). The full number is never stored in the log.
// The same page lists accounts whose contact syncing was paused as a possible scrape, so an admin can clear them.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const db = adminDb()
    const [log, paused] = await Promise.all([
      db.collection('phoneLookups').orderBy('at', 'desc').limit(100).get(),
      db.collection('contactSyncs').where('flagged', '==', true).limit(50).get(),
    ])
    return {
      log: log.docs.map(d => ({
        id: d.id, by: d.get('byName') || d.get('byEmail') || '', last4: d.get('last4') ?? '', found: d.get('found') === true,
        result: d.get('resultEmail') ?? '', at: d.get('at')?.toMillis?.() ?? 0,
      })),
      paused: paused.docs.map(d => ({
        uid: d.id, name: d.get('flagName') ?? '', email: d.get('flagEmail') ?? '', reason: d.get('flagReason') ?? '', at: d.get('flagAt')?.toMillis?.() ?? 0,
      })),
    }
  })
}

// { action: 'lookup', phone }  or  { action: 'clear', uid }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireAdmin(req)
    const b = await readJson(req)
    const db = adminDb()

    if (b.action === 'clear') {
      const uid = str(b.uid, 128)
      if (!uid) throw new HttpError(400, 'Pick an account.')
      await db.collection('contactSyncs').doc(uid).set({
        flagged: FieldValue.delete(), flagReason: FieldValue.delete(), flagAt: FieldValue.delete(),
        flagEmail: FieldValue.delete(), flagName: FieldValue.delete(), flagClearedAt: Timestamp.now(), flagClearedBy: me.uid,
      }, { merge: true })
      return { ok: true }
    }

    const e164 = normalizeUS(str(b.phone, 30))
    if (!e164) throw new HttpError(400, 'Enter a valid 10-digit US phone number.')
    const key = await indexKeyFromE164(e164)
    const idx = await db.collection('phoneIndex').doc(key).get()
    const uid = idx.exists ? (idx.get('uid') as string | undefined) : undefined
    const u = uid ? await db.collection('users').doc(uid).get() : null
    const account = u?.exists
      ? { uid: uid!, name: [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' ') || String(u.get('displayName') ?? ''), email: String(u.get('email') ?? ''), level: String(u.get('level') ?? '') }
      : null

    // Several accounts can share a number: list the others too.
    const sharing = (await db.collection('users').where('phoneHash', '==', key).limit(10).get()).docs
      .filter(d => d.id !== uid)
      .map(d => ({ uid: d.id, name: [d.get('firstName'), d.get('lastName')].filter(Boolean).join(' ') || String(d.get('displayName') ?? ''), email: String(d.get('email') ?? ''), level: String(d.get('level') ?? '') }))

    const by = await db.collection('users').doc(me.uid).get()
    await db.collection('phoneLookups').add({
      byUid: me.uid, byEmail: me.email ?? '', byName: String(by.get('firstName') ?? ''),
      last4: e164.slice(-4), found: !!account, ...(account ? { resultUid: account.uid, resultEmail: account.email } : {}), at: Timestamp.now(),
    })
    return { found: !!account || sharing.length > 0, account: account ?? sharing[0] ?? null, alsoUsing: account ? sharing : sharing.slice(1), last4: e164.slice(-4) }
  })
}
