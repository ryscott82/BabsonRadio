import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { loadEggs } from '@/lib/server/easterEggs'

export const runtime = 'nodejs'

// The same for everybody, so the edge caches it. Web and app both match it against what is playing.
export async function GET() {
  return handle(async () => ({ eggs: (await loadEggs(adminDb())).filter(e => e.enabled) }),
    { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' })
}
