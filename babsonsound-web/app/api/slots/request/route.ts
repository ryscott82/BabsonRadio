import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { findConflict } from '@/lib/server/slots'
import { checkImageRef } from '@/lib/server/images'
import { SLOT_CATEGORIES, SLOT_RULES, SLOT_TYPES, type SlotCategory, type SlotType } from '@/lib/slots'

export const runtime = 'nodejs'

// A member asks for an on-air time. Staff approve or decline in /api/slots/decision.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)

    const title = str(b.title, 80)
    const description = str(b.description, 500)
    const type = b.type as SlotType
    const category = b.category as SlotCategory
    const startMs = Number(b.startAt)
    const durationMin = Number(b.durationMin)
    const audioURL = str(b.audioURL, 500)
    const img = b.imageUrl ? checkImageRef(t.uid, b.imageUrl, b.imagePath) : null // optional picture
    if (b.imageUrl && !img) throw new HttpError(400, 'That picture could not be used. Upload it again.')

    if (!title) throw new HttpError(400, 'Give your show a title.')
    if (!(type in SLOT_TYPES)) throw new HttpError(400, 'Pick live or pre-recorded.')
    if (!SLOT_CATEGORIES.includes(category)) throw new HttpError(400, 'Pick a category.')
    if (!Number.isFinite(startMs) || !Number.isFinite(durationMin)) throw new HttpError(400, 'Pick a start time and length.')
    const step = SLOT_RULES.stepMinutes
    if (durationMin < SLOT_RULES.minMinutes || durationMin > SLOT_RULES.maxMinutes || durationMin % step !== 0) {
      throw new HttpError(400, `Length must be ${SLOT_RULES.minMinutes}–${SLOT_RULES.maxMinutes} minutes in ${step}-minute steps.`)
    }
    if (startMs % (step * 60_000) !== 0) throw new HttpError(400, `Start time must be on a ${step}-minute mark.`)

    const now = Date.now()
    if (startMs < now + SLOT_RULES.minLeadHours * 3600_000) throw new HttpError(400, `Request at least ${SLOT_RULES.minLeadHours} hours ahead.`)
    if (startMs > now + SLOT_RULES.maxAdvanceDays * 86_400_000) throw new HttpError(400, `Requests can be up to ${SLOT_RULES.maxAdvanceDays} days ahead.`)

    if (audioURL) {
      if (type !== 'prerecorded') throw new HttpError(400, 'An audio link only applies to pre-recorded shows.')
      let u: URL
      try { u = new URL(audioURL) } catch { throw new HttpError(400, 'That audio link is not a valid URL.') }
      if (u.protocol !== 'https:') throw new HttpError(400, 'Audio links must start with https://')
    }

    const start = new Date(startMs)
    const end = new Date(startMs + durationMin * 60_000)
    const db = adminDb()

    if (await findConflict(db, start, end)) throw new HttpError(409, 'That time is already booked. Pick another.')

    const mine = await db.collection('slotRequests').where('requesterUid', '==', t.uid).get()
    if (mine.docs.filter(d => d.get('status') === 'pending').length >= SLOT_RULES.maxPendingPerUser) {
      throw new HttpError(429, `You can have ${SLOT_RULES.maxPendingPerUser} pending requests at a time.`)
    }

    const user = await db.collection('users').doc(t.uid).get()
    const ref = await db.collection('slotRequests').add({
      requesterUid: t.uid,
      requesterName: user.get('firstName') ?? user.get('displayName') ?? 'Student',
      requesterEmail: t.email ?? '',
      title, description, type, category, audioURL,
      imageUrl: img?.imageUrl ?? '', imagePath: img?.imagePath ?? '',
      startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end), durationMin,
      status: 'pending', createdAt: Timestamp.now(),
    })
    return { id: ref.id }
  })
}
