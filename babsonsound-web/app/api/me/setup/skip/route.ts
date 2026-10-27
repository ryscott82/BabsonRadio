import { handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { skipStep } from '@/lib/server/setup'

export const runtime = 'nodejs'

// "Not now" on a setup step:  POST { step }  ->  { ok, setup }
// A skipped step may be offered again on the next visit; after 3 skips it is offered at most once every 7 days.
// The email step is required and cannot be skipped.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    return { ok: true, setup: await skipStep(t, await accessOf(t), b.step) }
  }, { 'Cache-Control': 'no-store' })
}
