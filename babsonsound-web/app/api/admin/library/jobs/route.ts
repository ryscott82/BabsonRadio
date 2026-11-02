import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin } from '@/lib/server/http'
import { createJob, listJobs } from '@/lib/server/worker'

export const runtime = 'nodejs'

// POST { type, params } queues a job for the studio PC (refused when a job of that type is already queued or running).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    return createJob(adminDb(), t.uid, b.type, b.params)
  })
}

// GET ?before=<createdAt ms>: newest first, 25 per page. Read once per call; the page does not poll.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    return listJobs(adminDb(), Number(new URL(req.url).searchParams.get('before')) || undefined)
  })
}
