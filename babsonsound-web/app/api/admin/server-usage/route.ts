import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin, str } from '@/lib/server/http'
import { addUsage, deleteUsage, editUsage, listUsage } from '@/lib/server/serverUsage'

export const runtime = 'nodejs'

// The usage log (what Vercel's Usage page shows, typed in by an admin). Admin only; nothing here is cached.
//   GET  -> { entries: [{ id, date, activeCpuHours, edgeRequests, functionInvocations, fastDataTransferGB, note, enteredBy, enteredAt, topRoutes? }] }, newest date first
//   POST { action: 'add', ...entry } | { action: 'edit', id, ...entry } | { action: 'delete', id }
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return { entries: await listUsage(adminDb()) } }, { 'Cache-Control': 'private, no-store' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    const action = str(b.action, 8), id = str(b.id, 64)
    const by = t.email ?? t.uid
    const db = adminDb()
    if ((action === 'edit' || action === 'delete') && !id) throw new HttpError(400, 'Which entry?')
    const r = action === 'add' ? await addUsage(db, b, by)
      : action === 'edit' ? await editUsage(db, id, b, by)
      : action === 'delete' ? await deleteUsage(db, id)
      : null
    if (!r) throw new HttpError(400, 'Unknown action.')
    if (!r.ok) throw new HttpError(r.status, r.error)
    return { ok: true, id: r.id }
  })
}
