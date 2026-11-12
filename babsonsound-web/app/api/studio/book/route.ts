import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser } from '@/lib/server/http'
import { bookStudio, requireStudioBadge, resolveGuests } from '@/lib/server/studioBook'
import { loadStudioRules } from '@/lib/server/studioRules'
import { cleanGuests } from '@/lib/studioBookCore'

export const runtime = 'nodejs'

// Book the studio: { startAt (ms), durationMin, guests: [{ name, email } | { id }], justMe, policyAck: true }. Members with the Studio badge. Confirms at once.
// Rules (opening hours, 30-minute steps, 30 to 90 minutes, holds, look-ahead, capacity) come from Admin > Settings. Quiet hours never block: the reply says
// { quiet, warning }. Reply: { id, startAt, endAt, durationMin, status, quiet, warning }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    await requireStudioBadge(t)
    const b = await readJson(req)
    if (b.policyAck !== true) throw new HttpError(400, 'Tick the box to agree to the studio policy.', 'BR-BKG-005')
    const db = adminDb()
    const rules = await loadStudioRules(db)
    const g = cleanGuests(b.guests, b.justMe, rules.capacity)
    if (!g.ok) throw new HttpError(400, g.error, 'BR-BKG-004')
    const guests = await resolveGuests(db, t.uid, g.guests)
    return bookStudio(db, t, { startMs: Number(b.startAt), durationMin: Number(b.durationMin), guests, justMe: g.justMe })
  })
}
