import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { decideStrike } from '@/lib/server/strikes'

export const runtime = 'nodejs'

// E-board and Admin: { id, action: 'confirm' | 'excuse', note }. Confirm a pending flag (the person is emailed: 1 = a friendly note, 2 = a warning,
// 3 = show requests and studio bookings pause until the semester ends). Excuse a pending flag, or excuse a confirmed strike to take it back and lift a pause.
// Reply: { ok, uid, level, bannedUntil }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const id = str(b.id, 140), action = b.action
    if (!id || (action !== 'confirm' && action !== 'excuse')) throw new HttpError(400, 'Send { id, action: "confirm" | "excuse" }.')
    return decideStrike(adminDb(), id, action, str(b.note, 300), t.uid)
  })
}
