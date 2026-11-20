import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireMember } from '@/lib/server/http'
import { markPendingReady, readiness, signConduct } from '@/lib/server/conduct'

export const runtime = 'nodejs'

// What a would-be host still needs before requesting a slot: the conduct agreement, and training.
export async function GET(req: Request) {
  return handle(async () => readiness(adminDb(), await requireMember(req)))
}

// Sign the conduct agreement (typed full name + every box ticked).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const db = adminDb()
    await signConduct(db, t, b)
    // Their pending requests were sent before they signed: free the ones the auto-approver was waiting on.
    const ready = await readiness(db, t)
    await markPendingReady(db, t.uid, ready.trained)
    return ready
  })
}
