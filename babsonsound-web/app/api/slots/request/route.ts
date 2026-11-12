import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { checkImageRef } from '@/lib/server/images'
import { assertClean } from '@/lib/server/wordFilter'
import { createSlotRequests } from '@/lib/server/slotCreate'
import { loadSlotRules } from '@/lib/server/slotRules'
import { SLOT_CATEGORIES, SLOT_RULES, SLOT_TYPES, type SlotCategory, type SlotType } from '@/lib/slots'
import { checkAudioUrl, cleanWeeks, repeatStarts } from '@/lib/slotAuto'
import { loadStudioRules } from '@/lib/server/studioRules'
import { resolveGuests } from '@/lib/server/studioBook'
import { cleanGuests, liveLengthError } from '@/lib/studioBookCore'

export const runtime = 'nodejs'

// A member asks for an on-air time. Staff approve or decline in /api/slots/decision, or the request approves itself after 24 hours
// (12 hours before the show if that is sooner) when nothing stops it (lib/server/autoApprove.ts).
// Optional `repeatWeeks` (0 to 3) asks for the same New York time on the next weeks too, as one group (`groupId`). Weeks that are taken, too soon,
// too far ahead or already requested are skipped. Reply: { id, ids, skipped, groupId, needsAgreement, quiet, warning }. A group counts as one pending request.
// Also required: `policyAck: true` (the policy box) and who is coming: `guests` [{ name, email } | { id }] or `justMe: true`. A live show is at most 90 minutes
// (pre-recorded shows keep the longer cap) and holds the studio unless `noStudio: true`. Three confirmed strikes pause new requests.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)

    const title = str(b.title, 80)
    const description = str(b.description, 500)
    const location = str(b.location, 120) // special requests, e.g. where a live show is recorded
    const type = b.type as SlotType
    const category = b.category as SlotCategory
    const startMs = Number(b.startAt)
    const durationMin = Number(b.durationMin)
    const audioURL = str(b.audioURL, 500)
    const rules = await loadSlotRules(adminDb())
    const weeks = cleanWeeks(b.repeatWeeks, rules.maxRepeatWeeks)
    const img = b.imageUrl ? checkImageRef(t.uid, b.imageUrl, b.imagePath) : null // optional picture
    if (b.imageUrl && !img) throw new HttpError(400, 'That picture could not be used. Upload it again.')

    if (!title) throw new HttpError(400, 'Give your show a title.')
    if (description.length < 10) throw new HttpError(400, 'Tell us what your show is about (a sentence or two).')
    if (!(type in SLOT_TYPES)) throw new HttpError(400, 'Pick live or pre-recorded.')
    if (!SLOT_CATEGORIES.includes(category)) throw new HttpError(400, 'Pick a category.')
    if (weeks === null) throw new HttpError(400, `Repeat for 0 to ${rules.maxRepeatWeeks} more weeks.`)
    if (!Number.isFinite(startMs) || !Number.isFinite(durationMin)) throw new HttpError(400, 'Pick a start time and length.')
    const step = SLOT_RULES.stepMinutes
    if (durationMin < SLOT_RULES.minMinutes || durationMin > SLOT_RULES.maxMinutes || durationMin % step !== 0) {
      throw new HttpError(400, `Length must be ${SLOT_RULES.minMinutes}–${SLOT_RULES.maxMinutes} minutes in ${step}-minute steps.`)
    }
    if (startMs % (step * 60_000) !== 0) throw new HttpError(400, `Start time must be on a ${step}-minute mark.`)
    const tooLong = liveLengthError(type, durationMin)
    if (tooLong) throw new HttpError(400, tooLong, 'BR-SLT-006')
    if (b.policyAck !== true) throw new HttpError(400, 'Tick the box to agree to the studio and show policy.', 'BR-BKG-005')

    if (audioURL) {
      if (type !== 'prerecorded') throw new HttpError(400, 'An audio link only applies to pre-recorded shows.')
      const bad = checkAudioUrl(audioURL)
      if (bad) throw new HttpError(400, bad)
    }

    const db = adminDb()
    const studio = await loadStudioRules(db)
    const g = cleanGuests(b.guests, b.justMe, studio.capacity)
    if (!g.ok) throw new HttpError(400, g.error, 'BR-BKG-004')
    const guests = await resolveGuests(db, t.uid, g.guests)
    // The same word filter as every other text a member writes that others may read (the show's title, description and location).
    await assertClean(db, title, description, location)

    const wantsPublic = b.publicConsent != null && typeof b.publicConsent === 'object'
    const r = await createSlotRequests(db, t, {
      title, description, location, type, category, audioURL, img, durationMin, receiveRatings: b.receiveRatings !== false,
      publicConsent: wantsPublic ? (b.publicConsent as Record<string, unknown>) : null, guests, justMe: g.justMe, noStudio: b.noStudio === true,
    }, [startMs, ...repeatStarts(startMs, weeks)], { hardFirst: true })
    return r
  })
}
