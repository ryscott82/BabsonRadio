import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStrikeStaff, str } from '@/lib/server/http'
import { decideStrike, flagStrike } from '@/lib/server/strikes'
import { loadStudioRules } from '@/lib/server/studioRules'
import { semesterEndMs } from '@/lib/strikesCore'

export const runtime = 'nodejs'

// E-board, BabsonARTS and Admins issue a strike or a ban by hand: { uid, note, kind?: 'strike' | 'ban-studio' | 'ban-semester', confirm? }.
// It is a pending flag unless `confirm: true`, which confirms it right away as the person issuing it (the person is emailed, like any confirmed strike).
// A ban is a strike-like record that does not add to the count: 'ban-studio' is one week without the studio, 'ban-semester' is no hosting or booking
// until the semester ends. Reply: { ok, id }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStrikeStaff(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128), note = str(b.note, 300)
    if (!uid || !note) throw new HttpError(400, 'Pick a person and write a note.')
    const kind = b.kind === 'ban-studio' || b.kind === 'ban-semester' ? b.kind : 'manual'
    const db = adminDb()
    if (!(await db.collection('users').doc(uid).get()).exists) throw new HttpError(404, 'That person was not found.')
    const confirm = b.confirm === true
    if (confirm && semesterEndMs((await loadStudioRules(db)).semesterEnd) <= Date.now()) throw new HttpError(400, 'The semester end date in Settings has passed. Set the new date first.')
    const refId = `${t.uid}-${Date.now()}`
    await flagStrike(db, { uid, kind, refId, note, at: Date.now(), by: t.uid })
    const id = `${kind}_${refId}`
    if (confirm) await decideStrike(db, id, 'confirm', '', t.uid)
    await db.collection('hostActions').add({ uid: t.uid, action: confirm ? `${kind}-add-confirmed` : `${kind}-add`, show: '(strikes)', detail: `${uid}: ${note}`.slice(0, 160), at: Timestamp.now() }).catch(() => {})
    return { ok: true, id }
  })
}
