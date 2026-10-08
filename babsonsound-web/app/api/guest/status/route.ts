import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, handle, isBabsonToken, isDeveloperToken, isTesterToken, requireUser } from '@/lib/server/http'
import { ensureGuestUserDoc, guestLibraryAccess } from '@/lib/server/guests'
import { finishSchoolUpgrade } from '@/lib/server/upgrade'

export const runtime = 'nodejs'

// One call tells the apps what the signed-in person may do.
//   canListenLive    → live radio: everyone who is signed in (a beta tester still waiting for approval cannot yet)
//   canAccessBacklog → the Library: students and developers, plus guests with a sponsor's pass or a student who has them in their contacts
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if (isDeveloperToken(t)) return { tier: 'developer', canListenLive: true, canAccessBacklog: true }

    const email = (t.email ?? '').toLowerCase()
    if (BABSON_EMAIL.test(email) || isTesterToken(t)) {
      const ok = isBabsonToken(t)
      // A guest who just switched to their school email becomes a student here.
      const upgraded = ok ? await finishSchoolUpgrade(adminDb(), t) : false
      return { tier: 'student', needsVerification: !ok, canListenLive: ok, canAccessBacklog: ok, upgraded }
    }

    const db = adminDb()
    // Waiting for the station to approve them as a beta tester: can't use anything yet.
    if ((await db.collection('users').doc(t.uid).get()).get('betaStatus') === 'pending') {
      return { tier: 'pending', canListenLive: false, canAccessBacklog: false }
    }
    const emailVerified = t.email_verified === true || (await adminAuth().getUser(t.uid)).emailVerified
    await ensureGuestUserDoc(db, t.uid, email, t.name ?? 'Guest')

    const [library, passSnap, reqSnap] = await Promise.all([
      guestLibraryAccess(db, t.uid, email, emailVerified),
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
      pass,
      requestStatus: latest?.status ?? null,
      canListenLive: true,
      canAccessBacklog: library.ok,
      libraryVia: library.via,
      libraryUntil: library.until,
    }
  })
}
