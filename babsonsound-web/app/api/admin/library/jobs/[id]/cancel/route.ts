import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireAdmin } from '@/lib/server/http'
import { cancelJob } from '@/lib/server/worker'

export const runtime = 'nodejs'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin(req)
    const { id } = await ctx.params
    if (!id || id.length > 64 || id.includes('/')) throw new HttpError(404, 'That job does not exist.', 'BR-LIB-006')
    return cancelJob(adminDb(), id)
  })
}
