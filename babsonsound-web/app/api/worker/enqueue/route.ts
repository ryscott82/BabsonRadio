import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson } from '@/lib/server/http'
import { WORKER_UID } from '@/lib/worker'
import { createJob, requireWorker } from '@/lib/server/worker'

export const runtime = 'nodejs'

// The studio PC asks for a library scan when it sees new media in AzuraCast (checked hourly). body { type: "library.scan" }.
// Only that one job type, with no params; refused like any job when one of the same kind is already queued or running.
export async function POST(req: Request) {
  return handle(async () => {
    await requireWorker(req)
    const b = await readJson(req)
    if (b.type !== 'library.scan') throw new HttpError(400, 'The studio PC can only ask for a library scan.', 'BR-LIB-003')
    return createJob(adminDb(), WORKER_UID, 'library.scan', {})
  })
}
