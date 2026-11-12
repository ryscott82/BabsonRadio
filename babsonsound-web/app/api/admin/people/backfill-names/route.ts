import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { nameLower } from '@/lib/studioBookCore'

export const runtime = 'nodejs'

// One-time backfill for the guest type-ahead (Admin only): sets users.nameLower for accounts made before it existed. Run it until it says done:
//   POST { after?: <last uid from the previous reply> }  ->  { updated, next: string | null, done }
// 300 accounts per call. New and edited names keep the field up to date by themselves.
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const body: Record<string, unknown> = await readJson(req).catch(() => ({}))
    const after = str(body.after, 128)
    const db = adminDb()
    let q = db.collection('users').orderBy('__name__').select('firstName', 'lastName', 'nameLower').limit(300)
    if (after) q = q.startAfter(after)
    const snap = await q.get()
    const batch = db.batch()
    let updated = 0
    for (const d of snap.docs) {
      const v = nameLower(d.get('firstName'), d.get('lastName'))
      if (v && d.get('nameLower') !== v) { batch.update(d.ref, { nameLower: v }); updated++ }
    }
    if (updated) await batch.commit()
    const last = snap.docs[snap.docs.length - 1]
    return { updated, next: snap.size === 300 && last ? last.id : null, done: snap.size < 300 }
  })
}
