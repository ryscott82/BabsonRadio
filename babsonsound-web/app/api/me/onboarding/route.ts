import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { deleteAccountData } from '@/lib/server/deleteAccount'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { encryptJson } from '@/lib/server/pii'
import { indexKeyFromE164 } from '@/lib/server/phone'
import { normalizeUS } from '@/lib/phone'
import { validGradYear } from '@/lib/terms'
import { ageOn } from '@/lib/age'

export const runtime = 'nodejs'

const RANGES = ['under13', '13-17', '18-24', '25plus'] as const
type Range = (typeof RANGES)[number]

// The one-time "tell us about you" step after signing in: name, phone, graduation year and a birthday (or, if the person
// would rather not share it, an age range). The birthday or range is saved encrypted. Under 13: nothing is kept (the
// account is deleted). 13 to 17: a parent or guardian box must be ticked.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await accessOf(t)).demo) return { ok: true } // the Apple reviewer account skips this step
    const b = await readJson(req)
    const db = adminDb()
    const ref = db.collection('users').doc(t.uid)
    const u = await ref.get()
    if (!u.exists) throw new HttpError(404, 'Profile not found.')
    const guest = (u.get('level') ?? u.get('role')) === 'guest'

    // 1. Age first, so an under-13 never gets any more of their data stored.
    let age: number | null = null
    let saved: Record<string, unknown>
    const bd = (b.birthdate ?? null) as { year?: unknown; month?: unknown; day?: unknown } | null
    if (bd) {
      age = ageOn(Number(bd.year), Number(bd.month), Number(bd.day))
      if (age === null) throw new HttpError(400, 'Pick a real birthday.', 'BR-AGE-003')
      saved = { birthdate: { year: Number(bd.year), month: Number(bd.month), day: Number(bd.day) } }
    } else if (typeof b.ageRange === 'string' && (RANGES as readonly string[]).includes(b.ageRange)) {
      const r = b.ageRange as Range
      age = r === 'under13' ? 12 : r === '13-17' ? 15 : r === '18-24' ? 20 : 30
      saved = { ageRange: r }
    } else {
      throw new HttpError(400, 'Add your birthday, or pick an age range.', 'BR-AGE-003')
    }
    if (age < 13) {
      await deleteAccountData(t.uid)
      throw new HttpError(403, 'Babson Radio is for people 13 and older. Your account and info were deleted.', 'BR-AGE-001')
    }
    const minor = age < 18
    if (minor && b.parentalConsent !== true) {
      throw new HttpError(400, 'A parent or guardian needs to be okay with you using Babson Radio.', 'BR-AGE-002')
    }

    // 2. Contact details.
    const firstName = str(b.firstName, 40), lastName = str(b.lastName, 60)
    if (!firstName) throw new HttpError(400, 'Enter your first name.')
    const update: Record<string, unknown> = { firstName, lastName, displayName: firstName }

    if (!guest) {
      // Phone and graduation year are optional. A phone number lets friends find you; skipping it is fine.
      const rawPhone = str(b.phone, 30), phone = normalizeUS(rawPhone)
      if (rawPhone && !phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number, or leave it blank.')
      const gradYear = str(b.gradYear, 10)
      if (gradYear && !validGradYear(gradYear)) throw new HttpError(400, 'Pick a valid graduation year.', 'BR-ACC-018')
      if (gradYear) update.gradYear = gradYear
      const old = u.get('phoneNumber') as string | undefined
      if (phone && old !== phone) {
        const newRef = db.collection('phoneIndex').doc(await indexKeyFromE164(phone))
        await db.runTransaction(async tx => {
          const hit = await tx.get(newRef)
          if (hit.exists && hit.get('uid') !== t.uid) throw new HttpError(409, 'That phone number is already registered.')
          tx.set(newRef, { uid: t.uid })
        })
        if (old) await db.collection('phoneIndex').doc(await indexKeyFromE164(old)).delete().catch(() => {})
        update.phoneNumber = phone
      }
    }

    // 3. Save. The birthday/range is only ever stored encrypted; "minor" is a plain yes/no so the server can act on it.
    update.ageData = encryptJson({ ...saved, savedAt: new Date().toISOString() })
    update.minor = minor
    update.parentalConsent = minor ? true : FieldValue.delete()
    update.onboardedAt = Timestamp.now()
    await ref.update(update)
    return { ok: true }
  })
}
