import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'

export const runtime = 'nodejs'

// The station's shows, for the apps' Shows tab (the website reads the same collection directly). Students and up.
export async function GET(req: Request) {
  return handle(async () => {
    await requireLibrary(req)
    const snap = await adminDb().collection('shows').where('isActive', '==', true).get()
    const items = snap.docs.map(d => ({
      id: d.id, slug: String(d.get('slug') ?? ''), name: String(d.get('name') ?? ''), category: String(d.get('category') ?? ''),
      description: String(d.get('description') ?? ''), longDescription: String(d.get('longDescription') ?? ''),
      artworkURL: String(d.get('artworkURL') ?? ''), isFeatured: d.get('isFeatured') === true,
      hostNames: Array.isArray(d.get('hostNames')) ? (d.get('hostNames') as unknown[]).map(String) : [],
      totalEpisodes: Number(d.get('totalEpisodes') ?? 0),
    })).sort((a, b) => a.name.localeCompare(b.name))
    return { items }
  })
}
