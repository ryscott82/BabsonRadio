import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, handle, isBabsonToken, isDeveloperToken, isTesterToken, requireUser } from '@/lib/server/http'
import { ensureGuestUserDoc, ensureTrial } from '@/lib/server/guests'

export const runtime = 'nodejs'

// One call tells the apps what the signed-in person may do.
//   canListenLive    → live radio (students, developers, guests with a trial or sponsored pass)
//   canAccessBacklog → stored episodes (students and developers ONLY — never guests)
// The first call for a guest starts their one-time trial.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if (isDeveloperToken(t)) return { tier: 'developer', canListenLive: true, canAccessBacklog: true }

    const email = (t.email ?? '').toLowerCase()
    if (BABSON_EMAIL.test(email) || isTesterToken(t)) {
      const ok = isBabsonToken(t)
      return { tier: 'student', needsVerification: !ok, canListenLive: ok, canAccessBacklog: ok }
    }

    const db = adminDb()
    const emailVerified = t.email_verified === true || (await adminAuth().getUser(t.uid)).emailVerified
    await ensureGuestUserDoc(db, t.uid, email, t.name ?? 'Guest')
    const trialEndsAt = await ensureTrial(db, t.uid)

    const [passSnap, reqSnap] = await Promise.all([
      db.collection('guestPasses').doc(t.uid).get(),
      db.collection('guestRequests').where('guestUid', '==', t.uid).get(),
    ])
    const now = Date.now()
    const pass = passSnap.exists && passSnap.get('revoked') !== true && passSnap.get('expiresAt').toMillis() > now
      ? { sponsorName: passSnap.get('sponsorName'), expiresAt: passSnap.get('expiresAt').toMillis() }
      : null
    const latest = reqSnap.docs
      .map(d => ({ status: d.get('status'), createdAt: d.get('createdAt').toMillis() }))
      .sort((a, b) => b.createdAt - a.createdAt)[0]

    return {
      tier: 'guest',
      emailVerified,
      trialEndsAt,
      pass,
      requestStatus: latest?.status ?? null,
      canListenLive: trialEndsAt > now || !!pass,
      canAccessBacklog: false,
    }
  })
}
