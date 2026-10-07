import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'

export const runtime = 'nodejs'

// dryRun: true  → show what the scheduler WOULD do, change nothing.
// dryRun: false → rebuild the next-48-hour filler blocks now.
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const r = await rebuildAutoSchedule(adminDb(), { dryRun: b.dryRun !== false })
    return { ...r, blocks: r.blocks.map(x => ({ ...x })) }
  })
}
