import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { LEVELS, forgetAccess, isOwnerEmail, isSchoolEmail, type Level } from '@/lib/server/access'

export const runtime = 'nodejs'

// One access level per person: guest < student < director < admin. Badges (studioTrained, radioTrained) are separate flags.
// Only admins manage people. Owner accounts (OWNER_EMAILS) cannot be changed by anyone else. The hidden demo account is not listed.

// Everyone with an account (newest first), for the admin Users page.
export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireAdmin(req)
    const snap = await adminDb().collection('users').orderBy('joinedAt', 'desc').limit(500).get()
    return {
      levels: LEVELS,
      users: snap.docs.filter(d => d.get('demo') !== true).map(d => {
        const email = String(d.get('email') ?? '')
        return {
          id: d.id,
          name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim(),
          username: d.get('username') ?? '',
          email,
          level: (LEVELS as string[]).includes(d.get('level')) ? d.get('level') : 'guest',
          studioTrained: d.get('studioTrained') === true,
          radioTrained: d.get('radioTrained') === true,
          owner: isOwnerEmail(email),
          you: d.id === me.uid,
        }
      }),
    }
  })
}

// Change someone's level and/or badges: { uid, level?: 'guest'|'student'|'director'|'admin', studioTrained?: boolean, radioTrained?: boolean }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireAdmin(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128)
    const level = b.level === undefined ? null : str(b.level, 20) as Level
    if (!uid) throw new HttpError(400, 'Invalid request.')
    if (level !== null && !LEVELS.includes(level)) throw new HttpError(400, 'Invalid request.')
    if (level === null && typeof b.studioTrained !== 'boolean' && typeof b.radioTrained !== 'boolean') throw new HttpError(400, 'Nothing to change.')
    if (uid === me.uid && level !== null) throw new HttpError(400, 'You cannot change your own level.')
    const ref = adminDb().collection('users').doc(uid)
    const u = await ref.get()
    if (!u.exists) throw new HttpError(404, 'User not found.')
    const email = String(u.get('email') ?? '').toLowerCase()
    if (isOwnerEmail(email)) throw new HttpError(403, 'Owner accounts cannot be changed.')
    // Students and above need a school email.
    if (level && level !== 'guest' && !isSchoolEmail(email)) throw new HttpError(400, 'Only people with a school email can be students, directors or admins.')

    const update: Record<string, unknown> = {}
    if (level) {
      update.level = level
      update.role = FieldValue.delete() // old field, replaced by level
      if (level === 'guest') { update.studioTrained = false; update.radioTrained = false }
    }
    if (typeof b.studioTrained === 'boolean') update.studioTrained = b.studioTrained
    if (typeof b.radioTrained === 'boolean') update.radioTrained = b.radioTrained
    await ref.update(update)

    // Old sign-in claims are no longer used for access; clear them so they cannot confuse anything.
    const claims = (await adminAuth().getUser(uid)).customClaims ?? {}
    const { developer: _d, tester: _t, openMember: _o, ...rest } = claims as Record<string, unknown>
    void _d; void _t; void _o
    if (Object.keys(rest).length !== Object.keys(claims).length) await adminAuth().setCustomUserClaims(uid, rest)
    forgetAccess(uid)
    return { ok: true }
  })
}
