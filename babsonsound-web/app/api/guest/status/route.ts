import { adminAuth, adminDb } from '@/lib/server/admin'
import { handle, requireUser } from '@/lib/server/http'
import { ensureGuestUserDoc } from '@/lib/server/guests'
import { finishSchoolUpgrade } from '@/lib/server/upgrade'
import { isLocked } from '@/lib/server/launchAccess'
import { accessOf, forgetAccess, isSchoolEmail } from '@/lib/server/access'

export const runtime = 'nodejs'

// One call tells the apps what the signed-in person may do.
//   level            guest | student | director | admin
//   canListenLive    live radio: everyone signed in, once the site is open
//   canAccessBacklog the Library: students and above (guests never)
// `tier` is kept for older app builds: 'student' for student and above, otherwise 'guest'.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const email = (t.email ?? '').toLowerCase()
    // A guest who just switched to their school email becomes a student here.
    if (isSchoolEmail(email) && t.email_verified === true && await finishSchoolUpgrade(adminDb(), t).catch(() => false)) forgetAccess(t.uid)
    const a = await accessOf(t)
    const locked = await isLocked(t)
    const base = { level: a.level, studioTrained: a.studio, radioTrained: a.radio, locked, canListenLive: !locked }

    if (a.level !== 'guest') return { ...base, tier: 'student', needsVerification: false, canAccessBacklog: !locked }

    // Guest. A school address that is not verified yet is told to verify it.
    const needsVerification = isSchoolEmail(email)
    const db = adminDb()
    const emailVerified = t.email_verified === true || (await adminAuth().getUser(t.uid)).emailVerified
    await ensureGuestUserDoc(db, t.uid, email, t.name ?? 'Guest')
    return { ...base, tier: 'guest', needsVerification, emailVerified, canAccessBacklog: false }
  })
}
