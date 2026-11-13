import { randomBytes } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'

export const runtime = 'nodejs'

// The QR code on the studio door: a signed-in member (website or app) scans it and this asks the studio PC to sign them in.
// Writes a one-time claim (server only) and pings the studio PC's idle screen, which is listening to boothDoorPing/latest (a doc that holds only
// a random claim id). The PC then claims it with its signed nonce (/api/booth/door-claim). Students only; claims last 60 seconds.
// The PC shows "Hello <name>, signing you in. Not you? Cancel" for a few seconds first, so a scan from somewhere else never silently signs anyone in.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const a = await accessOf(t)
    if (a.level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
    const db = adminDb()
    const now = Date.now()

    // One scan every few seconds per person.
    const cool = db.collection('boothDoorCooldown').doc(t.uid)
    if (Number((await cool.get()).get('at') ?? 0) > now - 5_000) throw new HttpError(429, 'You just scanned. Look at the studio screen.')
    await cool.set({ at: now })

    const u = await db.collection('users').doc(t.uid).get()
    const name = [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' ') || String(u.get('displayName') ?? t.email ?? 'Member')
    const firstName = String(u.get('firstName') ?? '') || name.split(' ')[0]
    const claimId = randomBytes(16).toString('hex')
    const batch = db.batch()
    batch.set(db.collection('boothDoorClaims').doc(claimId), { uid: t.uid, name, firstName, at: now, exp: now + 60_000, used: false, expiresAt: Timestamp.fromMillis(now + 24 * 3_600_000) })
    batch.set(db.collection('boothDoorPing').doc('latest'), { claimId, at: now })
    await batch.commit()
    return { ok: true, firstName }
  }, { 'Cache-Control': 'private, no-store' })
}
