import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { boothPermit, boothSecret, touchSession } from '@/lib/server/booth'
import { signToken, TOKEN_TTL_MS, verifyAttest } from '@/lib/booth'

export const runtime = 'nodejs'

// Studio PC sign-in. The page sends a nonce signed by the helper on the studio PC ({nonce, sig}), so this only works there.
// Logs the sign-in (or keeps the current session alive), says whether this person can go live now, and returns a 15-minute
// control token for the helper (l=true lets it go live; otherwise it can only end the stream). The page calls this every few minutes.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const secret = boothSecret()
    const b = await readJson(req)
    if (!verifyAttest(secret, str(b.nonce, 100), str(b.sig, 100), now)) {
      throw new HttpError(403, 'Open this page on the studio PC.', 'BR-BTH-001')
    }
    const t = await requireUser(req)
    const a = await accessOf(t)
    if (a.level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')

    const u = await db.collection('users').doc(t.uid).get()
    const name = [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' ') || String(u.get('displayName') ?? t.email ?? 'Member')
    const p = await boothPermit(db, t.uid, a, now)
    const sessionId = await touchSession(db, str(b.sessionId, 64), {
      uid: t.uid, name, email: t.email ?? '', level: a.level, canGoLive: p.canGoLive,
    }, now)
    const tokenExp = now + TOKEN_TTL_MS
    return {
      sessionId, name, level: a.level, ...p,
      token: signToken(secret, { u: t.uid, n: name, s: sessionId, l: p.canGoLive, exp: tokenExp }),
      tokenExp,
    }
  })
}
