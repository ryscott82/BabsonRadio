import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { HOST_WINDOW_MS, hostContext, occurrenceId, showOpen } from '@/lib/server/host'
import { azNowPlaying } from '@/lib/server/azuracast'

export const runtime = 'nodejs'

// Everything the host panel needs: my shows, whether the controls are open, what is playing.
export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const c = await hostContext(req, db, now)
    const controlsOpen = c.staff || c.open.length > 0
    let nowPlaying = null
    if (controlsOpen) nowPlaying = await azNowPlaying().catch(() => null)

    const pending = (await db.collection('showUpdates').where('requestedBy', '==', c.t.uid).get()).docs
      .filter(d => d.get('status') === 'pending').map(d => ({ id: d.id, scheduleId: d.get('scheduleId'), showName: d.get('showName') ?? '' }))

    return {
      staff: c.staff, controlsOpen, windowHours: HOST_WINDOW_MS / 3_600_000, now,
      shows: c.shows.map(s => ({ ...s, id: occurrenceId(s), open: showOpen(s, now) })),
      nowPlaying, pending,
    }
  })
}
