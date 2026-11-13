import { randomBytes } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { addCrew, crewFresh } from '@/lib/crew'
import { crewRef, loadCrew, logEvent } from '@/lib/server/booth'

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
    if (a.level === 'student' && !(a.studio && a.radio)) throw new HttpError(403, 'Do the radio room training first.', 'BR-STU-020')
    const db = adminDb()
    const now = Date.now()

    // One scan every few seconds per person.
    const cool = db.collection('boothDoorCooldown').doc(t.uid)
    if (Number((await cool.get()).get('at') ?? 0) > now - 5_000) throw new HttpError(429, 'You just scanned. Look at the studio screen.')
    await cool.set({ at: now })

    const u = await db.collection('users').doc(t.uid).get()
    const name = [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' ') || String(u.get('displayName') ?? t.email ?? 'Member')
    const firstName = String(u.get('firstName') ?? '') || name.split(' ')[0]
    // The booth is in use by someone else: join the studio crew instead of signing in (nobody is kicked out).
    const crew = await loadCrew(db)
    if (crewFresh(crew, now) && crew.driverUid !== t.uid) {
      const r = addCrew(crew, { uid: t.uid, name, firstName }, now)
      if (r.full) throw new HttpError(409, 'The studio crew is full.', 'BR-BTH-010')
      if (r.added) {
        await crewRef(db).update({ members: r.doc.members, updatedAt: now })
        await logEvent(db, crew.sessionId, t.uid, name, 'crew_join', '', now)
      }
      const id = randomBytes(16).toString('hex')
      const b2 = db.batch()
      b2.set(db.collection('boothDoorClaims').doc(id), { uid: t.uid, name, firstName, at: now, exp: now + 60_000, used: false, crew: true, expiresAt: Timestamp.fromMillis(now + 24 * 3_600_000) })
      b2.set(db.collection('boothDoorPing').doc('latest'), { claimId: id, at: now })
      await b2.commit()
      return { ok: true, firstName, crew: true, driverName: crew.driverName }
    }
    const claimId = randomBytes(16).toString('hex')
    const batch = db.batch()
    batch.set(db.collection('boothDoorClaims').doc(claimId), { uid: t.uid, name, firstName, at: now, exp: now + 60_000, used: false, expiresAt: Timestamp.fromMillis(now + 24 * 3_600_000) })
    batch.set(db.collection('boothDoorPing').doc('latest'), { claimId, at: now })
    await batch.commit()
    return { ok: true, firstName }
  }, { 'Cache-Control': 'private, no-store' })
}
