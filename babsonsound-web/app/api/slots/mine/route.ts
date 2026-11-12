import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { dueRequests, runAutoApprove } from '@/lib/server/autoApprove'

export const runtime = 'nodejs'

// Your own requests. Opening this also approves your requests whose auto-approval time has come (the same job the crons run, limited to you).
// Per request: autoApproveAt (ms, only while pending and not held), autoBlockedReason ('week-limit' | 'agreement' | 'training' | 'conflict' | 'past' | 'ineligible' | ''),
// held (staff are keeping it for a person to decide), approvedBy ('auto' | 'staff' | ''), groupId (repeat weeks share one). Nothing about anyone else.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const q = db.collection('slotRequests').where('requesterUid', '==', t.uid)
    let snap = await q.get()
    if (dueRequests(snap.docs, Date.now(), t.uid).length) {
      const run = await runAutoApprove(db, { uid: t.uid, candidates: snap.docs })
      if (run.approved) snap = await q.get()
    }
    const requests = snap.docs.map(d => {
      const status = d.get('status') as string
      const approved = status === 'approved'
      const pending = status === 'pending'
      const held = pending && d.get('held') === true
      const due = (d.get('autoApproveAt')?.toMillis?.() as number | undefined) ?? null
      return {
        id: d.id, title: d.get('title'), description: d.get('description'),
        type: d.get('type'), category: d.get('category'), audioURL: d.get('audioURL') ?? '',
        startAt: d.get('startAt').toMillis(), endAt: d.get('endAt').toMillis(),
        durationMin: d.get('durationMin'), status,
        staffNote: d.get('staffNote') ?? '',
        connectionInfo: approved ? (d.get('connectionInfo') ?? '') : '',
        createdAt: d.get('createdAt').toMillis(),
        groupId: d.get('groupId') ?? '',
        // your own guest list (nobody else's), and whether a live show is not using the studio
        guests: (d.get('guests') as unknown[] | undefined) ?? [], justMe: d.get('justMe') === true, noStudio: d.get('noStudio') === true,
        attachedRecordingId: String(d.get('attachedRecordingId') ?? ''),
        held,
        autoApproveAt: pending && !held ? due : null,
        autoBlockedReason: pending ? String(d.get('autoBlockedReason') ?? '') : '',
        approvedBy: approved ? (d.get('approvedBy') === 'auto' ? 'auto' : 'staff') : '',
      }
    }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
    return { requests }
  })
}
