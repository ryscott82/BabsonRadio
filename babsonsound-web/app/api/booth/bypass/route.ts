import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { adPlan, boothSecret, latestNote, nextOnAir, showOnAirNow, touchSession } from '@/lib/server/booth'
import { BYPASS_UID, TOKEN_TTL_MS, pinMatches, signToken, verifyAttest } from '@/lib/booth'

export const runtime = 'nodejs'

// The booth with nobody signed in (the "Bypass sign in" button on the idle screen). Only works on the studio PC (signed nonce).
//  - no PIN: the console opens, but the token cannot go live. Music, sound board and the level meter work.
//  - with the emergency PIN (BOOTH_EMERGENCY_PIN, for when sign-in or the internet is down): the token can go live. The session is
//    logged as "Studio PC (emergency)", with live start and stop events, so the E-board can see it in the studio PC log.
// Wrong PINs lock the PIN for 5 minutes after 5 tries (per server instance).
const tries = { n: 0, until: 0 }

export async function POST(req: Request) {
  return handle(async () => {
    const now = Date.now()
    const secret = boothSecret()
    const b = await readJson(req)
    const nonce = req.headers.get('x-booth-nonce') ?? str(b.nonce, 100), sig = req.headers.get('x-booth-sig') ?? str(b.sig, 100)
    if (!verifyAttest(secret, nonce.slice(0, 100), sig.slice(0, 100), now)) throw new HttpError(403, 'Open this page on the studio PC.', 'BR-BTH-001')

    const pin = str(b.pin, 20)
    let emergency = false
    if (pin) {
      const expected = process.env.BOOTH_EMERGENCY_PIN ?? ''
      if (expected.length < 4) throw new HttpError(503, 'The emergency PIN is not set up.', 'BR-BTH-004')
      if (now < tries.until) throw new HttpError(429, 'Too many tries. Wait 5 minutes.', 'BR-BTH-005')
      if (!pinMatches(expected, pin)) {
        if (++tries.n >= 5) { tries.until = now + 5 * 60_000; tries.n = 0 }
        throw new HttpError(403, 'Wrong PIN.', 'BR-BTH-006')
      }
      tries.n = 0
      emergency = true
    }

    const db = adminDb()
    const name = emergency ? 'Studio PC (emergency)' : 'Studio PC (no sign-in)'
    const sessionId = await touchSession(db, str(b.sessionId, 64), { uid: BYPASS_UID, name, email: '', level: 'bypass', canGoLive: emergency }, now)
    const tokenExp = now + TOKEN_TTL_MS
    const [ads, note, next, showRunning] = await Promise.all([adPlan(db), latestNote(db, now).catch(() => null), nextOnAir(db, now, now).catch(() => null), showOnAirNow(db, now)])
    return {
      sessionId, name, firstName: 'Studio', level: 'bypass', canGoLive: emergency, canRecord: false,
      // Nobody signed in: Go live is offered when no scheduled show is on air, and pressing it asks for a sign in (the page does that).
      signInToLive: !emergency && !showRunning,
      reason: emergency ? '' : showRunning ? 'A scheduled show is on air right now.' : 'Press Go live and sign in.',
      show: null, nextShow: null, ads, note, next,
      token: signToken(secret, { u: BYPASS_UID, n: name, s: sessionId, l: emergency, r: false, exp: tokenExp }),
      tokenExp,
    }
  })
}
