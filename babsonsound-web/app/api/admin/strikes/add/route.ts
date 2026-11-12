import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { flagStrike, refreshStanding } from '@/lib/server/strikes'
import { loadStudioRules } from '@/lib/server/studioRules'
import { semesterEndMs } from '@/lib/strikesCore'

export const runtime = 'nodejs'

// E-board and Admin add a strike by hand: { uid, note, confirm? }. It is a pending flag unless `confirm: true`, which records it as already confirmed
// by the person adding it (no email is sent for that one). Reply: { ok, id }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const uid = str(b.uid, 128), note = str(b.note, 300)
    if (!uid || !note) throw new HttpError(400, 'Pick a person and write a note.')
    const db = adminDb()
    if (!(await db.collection('users').doc(uid).get()).exists) throw new HttpError(404, 'That person was not found.')
    const confirm = b.confirm === true
    const expiresAt = semesterEndMs((await loadStudioRules(db)).semesterEnd)
    if (confirm && expiresAt <= Date.now()) throw new HttpError(400, 'The semester end date in Settings has passed. Set the new date first.')
    const refId = `${t.uid}-${Date.now()}`
    await flagStrike(db, { uid, kind: 'manual', refId, note, at: Date.now(), by: t.uid, ...(confirm ? { status: 'confirmed' as const, expiresAt } : {}) })
    if (confirm) await refreshStanding(db, uid)
    await db.collection('hostActions').add({ uid: t.uid, action: confirm ? 'strike-add-confirmed' : 'strike-add', show: '(strikes)', detail: `${uid}: ${note}`.slice(0, 160), at: Timestamp.now() }).catch(() => {})
    return { ok: true, id: `manual_${refId}` }
  })
}
