import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { runAutoApprove } from '@/lib/server/autoApprove'

export const runtime = 'nodejs'

// Pending show requests, soonest first, for the app's admin screen (the website reads these straight from Firestore).
// Decide with POST /api/slots/decision.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    await runAutoApprove(adminDb()).catch(() => null) // approve what is due first, so the list is current
    const snap = await adminDb().collection('slotRequests').where('status', '==', 'pending').get()
    const requests = snap.docs.map(d => ({
      id: d.id,
      title: String(d.get('title') ?? ''), description: String(d.get('description') ?? ''), location: String(d.get('location') ?? ''),
      type: String(d.get('type') ?? ''), category: String(d.get('category') ?? ''),
      requesterName: String(d.get('requesterName') ?? ''), requesterEmail: String(d.get('requesterEmail') ?? ''),
      startAt: d.get('startAt').toMillis() as number, durationMin: Number(d.get('durationMin') ?? 0),
      audioURL: String(d.get('audioURL') ?? ''), groupId: String(d.get('groupId') ?? ''), held: d.get('held') === true, heldNote: String(d.get('heldNote') ?? ''),
      autoApproveAt: (d.get('autoApproveAt')?.toMillis?.() as number | undefined) ?? null, autoBlockedReason: String(d.get('autoBlockedReason') ?? ''), autoEligible: d.get('autoEligible') !== false,
      cleanHours: d.get('cleanHours') === true, makePublic: d.get('makePublic') === true,
      guests: (d.get('guests') as unknown[] | undefined) ?? [], justMe: d.get('justMe') === true, noStudio: d.get('noStudio') === true, // E-board and Admin only
    })).sort((a, b) => a.startAt - b.startAt)
    return { requests }
  })
}
