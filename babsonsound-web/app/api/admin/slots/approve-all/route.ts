import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector } from '@/lib/server/http'
import { approveRequest, whenText, type ApprovedMail } from '@/lib/server/slotApproval'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { sendMail, slotDecisionMail } from '@/lib/server/mailer'
import { approveAll, cleanIds } from '@/lib/approveAll'

export const runtime = 'nodejs'

// E-board and Admins. POST { ids: string[] } (the exact ids the confirm list showed, at most 50).
// Each id is approved with approveRequest, the same code as POST /api/slots/decision (agreement, time still free, airSlots booking, decision email),
// one at a time, soonest show first. Only the ids in the request are touched. An id that is already handled answers { ok: false, reason: 'already handled' }.
// The auto schedule is rebuilt once at the end. Returns { results: [{ id, ok, reason? }] }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const c = cleanIds(b.ids)
    if ('error' in c) throw new HttpError(400, c.error)
    const db = adminDb()
    const r = await approveAll<ApprovedMail>(c.ids, {
      peek: async ids => {
        const snaps = await db.getAll(...ids.map(i => db.collection('slotRequests').doc(i)), { fieldMask: ['status', 'startAt'] })
        return new Map(snaps.map(s => [s.id, s.exists ? { status: String(s.get('status') ?? ''), startAt: (s.get('startAt') as Timestamp).toMillis() } : null]))
      },
      approve: async id => (await approveRequest(db, id, { by: t.uid })).mail,
      reasonOf: e => (e instanceof HttpError ? (e.status === 409 && /already handled/i.test(e.message) ? 'already handled' : e.message) : 'could not approve'),
      afterApproved: mail => {
        if (!mail.to) return
        const m = slotDecisionMail({ approved: true, title: mail.title, when: whenText(mail.at), note: '', connectionInfo: '' })
        after(() => sendMail(mail.to, m.subject, m.text, m.html))
      },
      rebuild: () => rebuildAutoSchedule(db).then(() => undefined).catch(e => console.error('[autoschedule]', e)),
    })
    await db.collection('hostActions').add({ uid: t.uid, action: 'approve-all', show: `(${r.approved} of ${c.ids.length})`, at: Timestamp.now() }).catch(() => null)
    return { results: r.results }
  })
}
