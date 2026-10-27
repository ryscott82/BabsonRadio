import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { LEVELS, forgetAccess, inviteKey, isOwnerEmail, type Level } from '@/lib/server/access'

export const runtime = 'nodejs'

// One access level per person: guest < student < director < admin. Badges (studioTrained, radioTrained) are separate flags.
// Only admins manage people. Owner accounts (OWNER_EMAILS) cannot be changed by anyone else. The hidden demo account is not listed.

// Everyone with an account (newest first), for the admin Users page.
export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireAdmin(req)
    const [snap, inv] = await Promise.all([adminDb().collection('users').orderBy('joinedAt', 'desc').limit(500).get(), adminDb().collection('roleInvites').get()])
    return {
      levels: LEVELS,
      // Roles waiting for someone who has no account yet (they apply the first time that email signs in, verified).
      invites: inv.docs.map(d => ({ email: d.get('email'), level: d.get('level'), studioTrained: d.get('studioTrained') === true, radioTrained: d.get('radioTrained') === true, at: (d.get('createdAt') as Timestamp | undefined)?.toMillis() ?? 0 })).sort((a, b) => b.at - a.at),
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
          instagram: String(d.get('instagram') ?? ''),
          owner: isOwnerEmail(email),
          you: d.id === me.uid,
        }
      }),
    }
  })
}

// Change someone's level and/or badges: { uid | email, level?: 'guest'|'student'|'director'|'admin', studioTrained?: boolean, radioTrained?: boolean }
// With an email that has no account yet, the role is saved as an invite and applies when that email first signs in.
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireAdmin(req)
    const b = await readJson(req)
    let uid = str(b.uid, 128)
    const email = str(b.email, 200).toLowerCase()
    // { uid, clearInstagram: true }: takes a member's Instagram handle off their profile (it is shown to others, so an admin can remove a bad one).
    // The clear is logged in instagramClears (who, whom, which handle, when) before the handle is removed.
    if (b.clearInstagram === true) {
      if (!uid) throw new HttpError(400, 'Pick an account.')
      const db = adminDb()
      const ref = db.collection('users').doc(uid)
      const u = await ref.get()
      if (!u.exists) throw new HttpError(404, 'User not found.')
      const old = String(u.get('instagram') ?? '')
      if (!old) return { ok: true, cleared: false }
      await db.collection('instagramClears').add({
        uid, handle: old, email: String(u.get('email') ?? ''), name: [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' '),
        byUid: me.uid, byEmail: me.email ?? '', at: Timestamp.now(),
      })
      await ref.update({ instagram: FieldValue.delete() })
      console.log(`[instagram-clear] ${me.email ?? me.uid} cleared the Instagram handle for ${uid}`)
      return { ok: true, cleared: true }
    }
    const level = b.level === undefined ? null : str(b.level, 20) as Level
    if (!uid && !ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    if (level !== null && !LEVELS.includes(level)) throw new HttpError(400, 'Invalid request.')
    if (level === null && typeof b.studioTrained !== 'boolean' && typeof b.radioTrained !== 'boolean') throw new HttpError(400, 'Nothing to change.')
    if (!uid) {
      if (isOwnerEmail(email)) throw new HttpError(403, 'Owner accounts cannot be changed.')
      const found = await adminDb().collection('users').where('email', '==', email).limit(1).get()
      if (found.empty) {
        // No account yet: keep the role as an invite.
        const iref = adminDb().collection('roleInvites').doc(inviteKey(email))
        const prev = await iref.get()
        await iref.set({
          email, level: level ?? prev.get('level') ?? 'student',
          studioTrained: typeof b.studioTrained === 'boolean' ? b.studioTrained : prev.get('studioTrained') === true,
          radioTrained: typeof b.radioTrained === 'boolean' ? b.radioTrained : prev.get('radioTrained') === true,
          createdBy: me.email ?? me.uid, createdAt: prev.get('createdAt') ?? Timestamp.now(),
        })
        return { ok: true, invited: true }
      }
      uid = found.docs[0].id // they already have an account: change it now
    }
    if (uid === me.uid && level !== null) throw new HttpError(400, 'You cannot change your own level.')
    const ref = adminDb().collection('users').doc(uid)
    const u = await ref.get()
    if (!u.exists) throw new HttpError(404, 'User not found.')
    const targetEmail = String(u.get('email') ?? '').toLowerCase()
    if (email && email !== targetEmail && !b.uid) throw new HttpError(404, 'User not found.')
    if (isOwnerEmail(targetEmail)) throw new HttpError(403, 'Owner accounts cannot be changed.')

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

// Take back a role you saved for an email that has no account yet: { email }
export async function DELETE(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const email = str((await readJson(req)).email, 200).toLowerCase()
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    await adminDb().collection('roleInvites').doc(inviteKey(email)).delete()
    return { ok: true }
  })
}
