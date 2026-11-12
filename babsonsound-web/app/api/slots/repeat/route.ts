import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { createSlotRequests } from '@/lib/server/slotCreate'
import { assertClean } from '@/lib/server/wordFilter'
import { type SlotCategory, type SlotType } from '@/lib/slots'
import { cleanWeeks, repeatStarts } from '@/lib/slotAuto'

export const runtime = 'nodejs'

// "Same time next week": copies one of your own pending or approved requests to the next 1 to 3 weeks (same New York time).
//   POST { requestId, weeks: 1..3 }   -> { id, ids, skipped, groupId, needsAgreement }
// The same checks as a new request (lead time, training for live, agreement, a group counts as one pending). Weeks that are taken, too soon or already requested are skipped.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const requestId = str(b.requestId, 100)
    const weeks = cleanWeeks(b.weeks)
    if (!requestId || !weeks) throw new HttpError(400, 'Pick 1 to 3 weeks.')
    const db = adminDb()
    const ref = db.collection('slotRequests').doc(requestId)
    const r = await ref.get()
    if (!r.exists || r.get('requesterUid') !== t.uid) throw new HttpError(404, 'Request not found.')
    if (r.get('status') !== 'pending' && r.get('status') !== 'approved') throw new HttpError(409, 'Only a pending or approved request can be repeated.')

    const title = String(r.get('title') ?? ''), description = String(r.get('description') ?? ''), location = String(r.get('location') ?? '')
    await assertClean(db, title, description, location) // the word list may have grown since the first request
    const startMs = (r.get('startAt').toMillis() as number)
    const groupId = (r.get('groupId') as string | undefined) || ref.id
    const out = await createSlotRequests(db, t, {
      title, description, location, type: r.get('type') as SlotType, category: r.get('category') as SlotCategory, audioURL: String(r.get('audioURL') ?? ''),
      img: r.get('imageUrl') ? { imageUrl: String(r.get('imageUrl')), imagePath: String(r.get('imagePath') ?? '') } : null,
      durationMin: Number(r.get('durationMin')), receiveRatings: r.get('receiveRatings') !== false, publicConsent: null,
    }, repeatStarts(startMs, weeks), { hardFirst: false, groupId })
    if (!r.get('groupId')) await ref.update({ groupId }).catch(() => {})
    return out
  })
}
