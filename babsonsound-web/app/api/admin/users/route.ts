import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { badgeExpiry } from '@/lib/studioRules'
import { cleanInstagram } from '@/lib/instagram'
import { validGradYear } from '@/lib/terms'
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
      // Roles waiting for someone who has no account yet (they attach when that email signs up and start once it is verified).
      invites: inv.docs.map(d => ({ email: d.get('email'), level: d.get('level'), studioTrained: d.get('studioTrained') === true, radioTrained: d.get('radioTrained') === true, at: (d.get('createdAt') as Timestamp | undefined)?.toMillis() ?? 0 })).sort((a, b) => b.at - a.at),
      users: snap.docs.filter(d => d.get('demo') !== true).map(d => {
        const email = String(d.get('email') ?? '')
        return {
          id: d.id,
          name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim(),
          firstName: String(d.get('firstName') ?? d.get('displayName') ?? ''), lastName: String(d.get('lastName') ?? ''), gradYear: String(d.get('gradYear') ?? ''),
          username: d.get('username') ?? '',
          email,
          level: (LEVELS as string[]).includes(d.get('level')) ? d.get('level') : 'guest',
          studioTrained: d.get('studioTrained') === true,
          radioTrained: d.get('radioTrained') === true,
          instagram: String(d.get('instagram') ?? ''),
          awaitingVerify: d.get('roleNeedsVerify') === true,
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
    // { uid, profile: { firstName?, lastName?, gradYear?, instagram? } }: an admin edits or adds a member's details. Leave a field out to keep it; send '' to clear
    // a last name, grad year or Instagram handle. Instagram and grad year are for students and above. Every change is logged in adminProfileEdits (who, whom, before and after).
    if (b.profile && typeof b.profile === 'object') {
      if (!uid) throw new HttpError(400, 'Pick an account.')
      const p = b.profile as Record<string, unknown>
      const db = adminDb()
      const ref = db.collection('users').doc(uid)
      const u = await ref.get()
      if (!u.exists) throw new HttpError(404, 'User not found.')
      if (isOwnerEmail(String(u.get('email') ?? '').toLowerCase()) && uid !== me.uid) throw new HttpError(403, 'Owner accounts cannot be changed.')
      const student = String(u.get('level') ?? 'guest') !== 'guest'
      const update: Record<string, unknown> = {}
      if ('firstName' in p) {
        const v = str(p.firstName, 40)
        if (!v) throw new HttpError(400, 'A first name is needed.')
        update.firstName = v; update.displayName = v
      }
      if ('lastName' in p) { const v = str(p.lastName, 60); update.lastName = v || FieldValue.delete() }
      if ('gradYear' in p) {
        const v = str(p.gradYear, 10)
        if (v && !student) throw new HttpError(400, 'Graduation year is for students.')
        if (v && !validGradYear(v)) throw new HttpError(400, 'Pick a graduation year from the list.')
        update.gradYear = v
      }
      if ('instagram' in p) {
        const raw = str(p.instagram, 200)
        if (!raw) update.instagram = FieldValue.delete()
        else {
          if (!student) throw new HttpError(400, 'Instagram is for students.')
          const h = cleanInstagram(raw)
          if (!h) throw new HttpError(400, 'That is not an Instagram handle or profile link.')
          update.instagram = h
        }
      }
      if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to change.')
      const before: Record<string, unknown> = {}
      for (const k of Object.keys(update)) before[k] = u.get(k) ?? ''
      await db.collection('adminProfileEdits').add({
        uid, byUid: me.uid, byEmail: me.email ?? '', at: Timestamp.now(), before,
        after: Object.fromEntries(Object.entries(update).map(([k, v]) => [k, v instanceof FieldValue ? '' : v])),
      })
      await ref.update(update)
      const n = (await ref.get())
      return {
        ok: true, firstName: String(n.get('firstName') ?? n.get('displayName') ?? ''), lastName: String(n.get('lastName') ?? ''),
        gradYear: String(n.get('gradYear') ?? ''), instagram: String(n.get('instagram') ?? ''),
      }
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
    if (typeof b.studioTrained === 'boolean') { update.studioTrained = b.studioTrained; update.studioExpiresAt = b.studioTrained ? Timestamp.fromMillis(badgeExpiry(Date.now())) : FieldValue.delete() } // a hand-set badge ends the next June 30 like the rest
    if (typeof b.radioTrained === 'boolean') { update.radioTrained = b.radioTrained; update.radioExpiresAt = b.radioTrained ? Timestamp.fromMillis(badgeExpiry(Date.now())) : FieldValue.delete() }
    // A role or badge given to an account whose email is not verified yet is saved, but gives nothing until it is.
    const authUser = await adminAuth().getUser(uid)
    if (!authUser.emailVerified && (level !== null || typeof b.studioTrained === 'boolean' || typeof b.radioTrained === 'boolean')) update.roleNeedsVerify = true
    await ref.update(update)

    // Old sign-in claims are no longer used for access; clear them so they cannot confuse anything.
    const claims = authUser.customClaims ?? {}
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
