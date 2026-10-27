import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { normalizeUS } from '@/lib/phone'
import { applyPhone } from '@/lib/server/phoneChange'
import { decryptJson } from '@/lib/server/pii'

// The admin phone-change flow is the one place besides the owner's own phone page that reads a stored number back.
const plain = (d: FirebaseFirestore.DocumentSnapshot, enc: string, legacy: string): string =>
  d.get(enc) ? decryptJson<string>(String(d.get(enc))) : String(d.get(legacy) ?? '')

export const runtime = 'nodejs'

// Admins only (phone numbers are private). Pending requests, and a way to set a number directly.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('phoneChanges').orderBy('requestedAt', 'asc').get()
    return {
      requests: snap.docs.map(d => ({
        uid: d.id, name: d.get('name') ?? '', email: d.get('email') ?? '', oldPhone: plain(d, 'oldPhoneEncrypted', 'oldPhone'), newPhone: plain(d, 'newPhoneEncrypted', 'newPhone'),
        at: (d.get('requestedAt') as Timestamp).toMillis(),
      })),
    }
  })
}

// { uid, action: 'approve' | 'reject' }  or  { uid, action: 'set', phone }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireStaff(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128), action = str(b.action, 10)
    if (!uid) throw new HttpError(400, 'Pick an account.')
    const db = adminDb()
    const reqRef = db.collection('phoneChanges').doc(uid)
    if (action === 'reject') { await reqRef.delete(); return { ok: true } }
    let phone: string | null
    if (action === 'approve') {
      const r = await reqRef.get()
      if (!r.exists) throw new HttpError(404, 'That request is gone.')
      phone = normalizeUS(plain(r, 'newPhoneEncrypted', 'newPhone'))
    } else if (action === 'set') phone = normalizeUS(str(b.phone, 30))
    else throw new HttpError(400, 'Unknown action.')
    if (!phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number.')
    await applyPhone(db, uid, phone)
    await reqRef.delete().catch(() => {})
    console.log(`[phone-change] ${me.email ?? me.uid} changed the number for ${uid}`)
    return { ok: true }
  })
}
