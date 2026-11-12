import { handle, readJson, requireAdmin, HttpError } from '@/lib/server/http'
import { loadSettings, patchSettings } from '@/lib/server/adminSettings'

export const runtime = 'nodejs'

// GET   every setting in one call: { settings: [{ key, label, level, kind, min, max, options, default, value, changed, changedAt, changedBy }] }
// PATCH { changes: { "limits.refreshSec": 600, "cpu.directAt": null } }  (null = back to the default) -> the same list, after saving.
//       Each value is checked against the table in lib/adminSettings.ts; one bad value rejects the whole save (400, nothing written).
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return { settings: await loadSettings() } })
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    try {
      const { rows, changed } = await patchSettings(b.changes, t.uid, t.email ?? t.uid)
      return { settings: rows, changed }
    } catch (e) {
      if ((e as { status?: number }).status === 400) throw new HttpError(400, (e as Error).message)
      throw e
    }
  })
}
