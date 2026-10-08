import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { hostContext } from '@/lib/server/host'

export const runtime = 'nodejs'

// Does this person host anything? (Decides whether the Host tab shows in the menu.)
export async function GET(req: Request) {
  return handle(async () => {
    const c = await hostContext(req, adminDb())
    return { host: c.staff || c.shows.length > 0 }
  })
}
