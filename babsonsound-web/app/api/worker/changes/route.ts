import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { listChanges, recordChanges, requireWorker } from '@/lib/server/worker'

export const runtime = 'nodejs'

// POST { jobId, changes: [{ songId, field, old, new, artist?, title?, undoOf? }] } (1 to 200). The PC reports each AzuraCast change it made.
//   field: title | artist | album | art | amplify | beat (beat needs artist and title).
//   library.apply: only for songs whose proposal is approved. library.undo: undoOf = the id of the change being reversed (once per change).
export async function POST(req: Request) {
  return handle(async () => {
    await requireWorker(req)
    const b = await readJson(req)
    const jobId = str(b.jobId, 64)
    if (!jobId || jobId.includes('/')) throw new HttpError(400, 'jobId is required.', 'BR-LIB-010')
    return recordChanges(adminDb(), jobId, b.changes)
  })
}

// GET ?jobId=&after=<ms>: change records, newest first, 100 per page (the undo job reads these).
export async function GET(req: Request) {
  return handle(async () => {
    await requireWorker(req)
    const u = new URL(req.url).searchParams
    return listChanges(adminDb(), { jobId: u.get('jobId') || undefined, after: Number(u.get('after')) || undefined })
  })
}
