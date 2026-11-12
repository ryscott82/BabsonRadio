import { adminDb } from '@/lib/server/admin'
import { roleLabel } from '@/lib/roleLabel'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { levelFromLegacy } from '@/lib/server/access'
import { ms, studioActor, writeGrants } from '@/lib/server/studio'
import { BADGES, badgeActive, badgeExpiry, planGrants, type Badge } from '@/lib/studioRules'

export const runtime = 'nodejs'

// Directors and admins. Grant or extend by hand: { uid, badges: ['studio'|'radio'], reason, expiresAt? }.
// expiresAt (ms) defaults to the next June 30, 11:59 PM Eastern and may be at most 3 years away. A new grant is added (never an edit),
// so an extension is just a later grant; the badge keeps the longest one. The reason (10+ characters) is stored on the grant.
export async function POST(req: Request) {
  return handle(async () => {
    const { t } = await studioActor(req, 'staff')
    const b = await readJson(req)
    const uid = str(b.uid, 128), reason = str(b.reason, 500)
    const badges = (Array.isArray(b.badges) ? b.badges : []).filter((x): x is Badge => BADGES.includes(x as Badge))
    if (!uid || !badges.length) throw new HttpError(400, 'Pick a person and at least one badge.')
    if (reason.length < 10) throw new HttpError(400, 'Type a reason of at least 10 characters.', 'BR-STU-019')
    const db = adminDb()
    const now = Date.now()
    const u = await db.collection('users').doc(uid).get()
    if (!u.exists) throw new HttpError(404, 'That person was not found.')
    const level = u.get('level') ?? levelFromLegacy(u.get('role'), u.get('email'))
    if (level !== 'student') throw new HttpError(400, level === 'guest' ? 'Guests cannot be trained. They need a verified school email first.' : `${roleLabel('director')} members and admins do not need badges.`, 'BR-STU-021')
    let expiresAt = badgeExpiry(now)
    if (b.expiresAt != null) {
      expiresAt = Number(b.expiresAt)
      if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 3 * 365 * 86_400_000) throw new HttpError(400, 'Pick an end date in the future, at most 3 years away.')
    }
    const hasStudio = u.get('studioTrained') === true && badgeActive(ms(u.get('studioExpiresAt')), now)
    if (!planGrants(badges, hasStudio).ok) throw new HttpError(403, 'Radio training needs Studio training first. Grant both.', 'BR-STU-014')
    const granted = await writeGrants(db, badges.map(badge => ({
      uid, badge, sessionId: 'manual', trainerUid: t.uid, quizId: 'manual', quizScore: null, agreementVersion: null, grantedBy: t.uid, reason, expiresAt,
    })), now, false)
    return { ok: true, granted, expiresAt }
  })
}
