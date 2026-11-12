import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { loadConfig, saveConfigAs } from '@/lib/server/autoschedule'
import { logSettingChanges } from '@/lib/server/adminSettings'
import { autoChanges } from '@/lib/adminSettings'
import { directorView, forbiddenForDirector } from '@/lib/autoschedule'

export const runtime = 'nodejs'

// Directors run Auto DJ day to day; Admins protect the machinery (field lists: DIRECTOR_FIELDS and ADMIN_FIELDS in lib/autoschedule.ts).
//   GET   Director: { role: 'director', config: { enabled (read-only), rules, defaultFillers } }
//         Admin:    { role: 'admin', config: everything, calendarUrl }
//   POST  { config } Director: only rules and defaultFillers (a per-rule `enabled` is part of rules). Any other field is refused with a 403, never dropped.
//         Admin: everything, as before. The saved document is read again inside the save, so a Director's save can never overwrite an Admin-only value.
//         An Admin's save writes one settingsLog line per changed value (same format as Admin > Settings).
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const cfg = await loadConfig(adminDb())
    if ((await accessOf(t)).level !== 'admin') return { role: 'director', config: directorView(cfg) }
    const origin = new URL(req.url).origin
    return { role: 'admin', config: cfg, calendarUrl: `${origin}/api/calendar.ics` }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const admin = (await accessOf(t)).level === 'admin'
    const b = await readJson(req)
    if (!admin) {
      const extra = [...Object.keys(b).filter(k => k !== 'config'), ...forbiddenForDirector(b.config)]
      if (extra.length) throw new HttpError(403, `Only admins can change: ${[...new Set(extra)].join(', ')}.`, 'BR-PERM-002')
    }
    const db = adminDb()
    const { before, after } = await saveConfigAs(db, b.config, { uid: t.uid, admin })
    if (admin) await logSettingChanges(db, autoChanges(before, after), t.email ?? t.uid).catch(e => console.error('[settingsLog]', e))
    return { config: admin ? after : directorView(after) }
  })
}
