import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'
import { station } from '@/lib/server/azuracast'

export const runtime = 'nodejs'

// Where to play an audio episode (a live show from the archive): { url }. The browser plays the file straight from AzuraCast, so no audio ever
// goes through this site (no Vercel bandwidth or CPU for playback). Students only, unless a host made the episode public.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Bad episode.')
    const snap = await adminDb().collection('episodes').doc(id).get()
    const unique = String(snap.get('azUniqueId') ?? '')
    if (!snap.exists || !unique) throw new HttpError(404, 'Episode not found.')
    if (snap.get('visibility') !== 'public') await requireLibrary(req)
    const base = (process.env.AZURACAST_URL ?? '').replace(/\/+$/, '')
    if (!base) throw new HttpError(503, 'Audio is not set up yet.')
    return { url: `${base}/api/station/${station()}/ondemand/download/${encodeURIComponent(unique)}` }
  })
}
