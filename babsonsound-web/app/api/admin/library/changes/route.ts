import { adminDb } from '@/lib/server/admin'
import { handle, requireAdmin } from '@/lib/server/http'
import { listChanges } from '@/lib/server/worker'

export const runtime = 'nodejs'

// GET ?jobId=&after=<ms>: every AzuraCast change the PC reported, newest first, 100 per page. Pick ids from here for a library.undo job.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const u = new URL(req.url).searchParams
    return listChanges(adminDb(), { jobId: u.get('jobId') || undefined, after: Number(u.get('after')) || undefined })
  })
}
