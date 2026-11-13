import { adminAuth, adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { boothSecret, crewRef, loadCrew, recordEvent } from '@/lib/server/booth'
import { verifyAttest } from '@/lib/booth'
import { crewFresh, handOff } from '@/lib/crew'

export const runtime = 'nodejs'

// A crew member takes over the studio PC (tapped on the PC screen): { nonce, sig, uid }. Only the studio PC can ask (signed nonce).
// The old driver's session ends and they join the crew; the answer is a Firebase custom token for the new driver.
// The page does not offer this while a show is on air or recording.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb(), now = Date.now()
    const b = await readJson(req)
    if (!verifyAttest(boothSecret(), str(b.nonce, 100), str(b.sig, 100), now)) throw new HttpError(403, 'Open this page on the studio PC.', 'BR-BTH-001')
    const crew = await loadCrew(db)
    if (!crewFresh(crew, now)) throw new HttpError(409, 'The studio crew is gone. Scan the door code again.', 'BR-BTH-011')
    const old = await db.collection('users').doc(crew.driverUid).get()
    const h = handOff(crew, str(b.uid, 128), String(old.get('firstName') ?? '') || crew.driverName.split(' ')[0], now)
    if (!h) throw new HttpError(404, 'That person is not in the studio crew.', 'BR-BTH-012')
    await recordEvent(db, crew.sessionId, crew.driverUid, 'sign_out', 'handed over to ' + h.newDriver.name, now).catch(() => {})
    await crewRef(db).set(h.doc)
    return { customToken: await adminAuth().createCustomToken(h.newDriver.uid), firstName: h.newDriver.firstName }
  }, { 'Cache-Control': 'private, no-store' })
}
