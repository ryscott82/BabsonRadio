import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff } from '@/lib/server/http'
import { azControl, azSkip, azuraConfigured, azNowPlaying } from '@/lib/server/azuracast'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { getNote, occIdOf } from '@/lib/server/live'

export const runtime = 'nodejs'

// Admin controls: what is on, the shows we can pin a message to, and the big buttons.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const db = adminDb()
    const now = Date.now()
    const items = (await buildScheduleFeed(db, { days: 2, showStudentHosts: false, now })).filter(i => i.source !== 'auto')
    const shows = await Promise.all(items.slice(0, 20).map(async i => ({
      occId: occIdOf(i), title: i.title, startAt: i.startAt, endAt: i.endAt, onAir: i.startAt <= now && i.endAt > now,
      note: await getNote(db, occIdOf(i), now),
    })))
    return { configured: azuraConfigured(), nowPlaying: await azNowPlaying().catch(() => null), shows }
  })
}

// { action: 'skip' | 'emergency-stop' | 'resume' }. Every use is logged.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const action = (await readJson(req)).action
    if (!azuraConfigured()) throw new HttpError(503, 'The radio controls are not connected yet.', 'BR-HST-003')
    try {
      if (action === 'skip') await azSkip()
      else if (action === 'emergency-stop') { await azControl('backend', 'stop'); await azControl('frontend', 'stop') }
      else if (action === 'resume') { await azControl('frontend', 'start'); await azControl('backend', 'start') }
      else throw new HttpError(400, 'Unknown action.')
    } catch (e) {
      if (e instanceof HttpError) throw e
      console.error('[admin controls]', e)
      throw new HttpError(502, 'The radio did not accept that. Check the AzuraCast key has broadcasting permission.', 'BR-HST-003')
    }
    await adminDb().collection('hostActions').add({ uid: t.uid, action: String(action), show: '(admin)', at: Timestamp.now() })
    return { ok: true }
  })
}
