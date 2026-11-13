import { adminAuth, adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { boothSecret } from '@/lib/server/booth'
import { verifyAttest } from '@/lib/booth'
import { crewList } from '@/lib/crew'
import { loadCrew } from '@/lib/server/booth'

export const runtime = 'nodejs'

// The studio PC claims a door scan: { nonce, sig, claimId } (nonce signed by the helper, so this only works on the studio PC).
// Returns a Firebase custom token for the person who scanned, and the claim is spent (one use, 60 seconds).
export async function POST(req: Request) {
  return handle(async () => {
    const now = Date.now()
    const b = await readJson(req)
    if (!verifyAttest(boothSecret(), str(b.nonce, 100), str(b.sig, 100), now)) throw new HttpError(403, 'Open this page on the studio PC.', 'BR-BTH-001')
    const ref = adminDb().collection('boothDoorClaims').doc(str(b.claimId, 64) || 'none')
    const got = await adminDb().runTransaction(async tx => {
      const s = await tx.get(ref)
      if (!s.exists || s.get('used') === true || Number(s.get('exp')) < now) return null
      tx.update(ref, { used: true, usedAt: now })
      return { uid: String(s.get('uid')), firstName: String(s.get('firstName') ?? ''), name: String(s.get('name') ?? ''), crew: s.get('crew') === true }
    })
    if (!got) throw new HttpError(410, 'That scan has expired. Scan the code again.')
    // Someone joined the crew: no sign-in, the PC just says who joined and adds them to the show's hosts.
    if (got.crew) return { crew: true, firstName: got.firstName, name: got.name, uid: got.uid, members: crewList(await loadCrew(adminDb())) }
    return { customToken: await adminAuth().createCustomToken(got.uid), firstName: got.firstName }
  }, { 'Cache-Control': 'private, no-store' })
}
