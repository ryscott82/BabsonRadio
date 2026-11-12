import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireMember } from '@/lib/server/http'
import { FieldValue } from 'firebase-admin/firestore'
import { readiness, signConduct } from '@/lib/server/conduct'
import { autoEligible } from '@/lib/slotAuto'

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
    // Their pending requests were sent before they signed; mark them signed now.
    const pending = await db.collection('slotRequests').where('requesterUid', '==', t.uid).where('status', '==', 'pending').get()
    const ready = await readiness(db, t)
    // Signing can free a request the auto-approver was waiting on: mark it eligible again and clear the "needs the agreement" note.
    await Promise.all(pending.docs.map(d => d.ref.update({
      conductSigned: true, autoEligible: autoEligible({ type: String(d.get('type')), conductSigned: true, radioTrained: ready.trained }),
      autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete(),
    })))
    return ready
  })
}
