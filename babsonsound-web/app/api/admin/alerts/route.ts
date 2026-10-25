import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { buildNotices, dismissNotices, dismissedKeys, readLog, restoreNotice } from '@/lib/server/notices'

export const runtime = 'nodejs'

// What needs attention: show requests, bug reports and ideas, recent cancellations and dead air.
// `items` is the Notifications card (each one can be opened and dismissed); the older count fields stay for the phone app and the tile badges.
// ?log=1 also returns the dismissed list, which doubles as a log of what has been handled.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const db = adminDb()
    const admin = (await accessOf(t)).level === 'admin'
    const all = await buildNotices(db, admin)
    const hidden = await dismissedKeys(db, all.map(n => n.key))
    const items = all.filter(n => !hidden.has(n.key)).map(({ cancel, ...rest }) => (void cancel, rest))

    const da = await db.collection('ops').doc('deadair').get()
    const lastSeen = da.get('lastSeen')?.toMillis?.() ?? 0
    const deadAir = { active: da.get('active') === true, since: da.get('since')?.toMillis?.() ?? 0, detail: da.get('detail') ?? '', monitorAgeSec: lastSeen ? Math.round((Date.now() - lastSeen) / 1000) : null }
    const count = (k: string) => all.filter(n => n.kind === k).length
    const wantLog = new URL(req.url).searchParams.get('log') === '1'
    return {
      items, dismissedCount: hidden.size,
      log: wantLog ? await readLog(db) : undefined,
      pendingRequests: count('request'), newReports: admin ? count('report') : null,
      cancellations: all.flatMap(n => (n.cancel ? [n.cancel] : [])),
      deadAir,
    }
  })
}

// { action: 'dismiss', keys: [...] } hides notifications and logs who did it; { action: 'restore', key } brings one back.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const db = adminDb()
    const b = await readJson(req)
    if (b.action === 'restore') {
      const key = String(b.key ?? '')
      if (!key || key.includes('/')) throw new HttpError(400, 'Invalid request.')
      await restoreNotice(db, key)
      return { ok: true }
    }
    if (b.action !== 'dismiss' || !Array.isArray(b.keys) || b.keys.length > 100) throw new HttpError(400, 'Invalid request.')
    const want = new Set(b.keys.map(String))
    const admin = (await accessOf(t)).level === 'admin'
    // Only notices this person can actually see are stored, and the saved text comes from the server, not the browser.
    const mine = (await buildNotices(db, admin)).filter(n => want.has(n.key))
    const u = await db.collection('users').doc(t.uid).get()
    const n = await dismissNotices(db, mine, { uid: t.uid, name: String(u.get('firstName') ?? u.get('displayName') ?? '') })
    return { ok: true, dismissed: n }
  })
}
