import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin, requireStrikeStaff, str } from '@/lib/server/http'
import { decideStrike } from '@/lib/server/strikes'

export const runtime = 'nodejs'

// { id, action: 'confirm' | 'excuse', note }. E-board, BabsonARTS and Admins can confirm a pending flag (the person is emailed: 1 = a friendly note,
// 2 = a week without the studio, 3 = show requests and studio bookings pause until the semester ends). Only an Admin can excuse: a pending flag, or a
// confirmed strike to take it back and lift a ban.
// Reply: { ok, uid, level, bannedUntil, studioBannedUntil }.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const id = str(b.id, 140), action = b.action
    if (!id || (action !== 'confirm' && action !== 'excuse')) throw new HttpError(400, 'Send { id, action: "confirm" | "excuse" }.')
    const t = action === 'excuse' ? await requireAdmin(req) : await requireStrikeStaff(req)
    return decideStrike(adminDb(), id, action, str(b.note, 300), t.uid)
  })
}
