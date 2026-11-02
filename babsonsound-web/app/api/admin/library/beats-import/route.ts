import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin } from '@/lib/server/http'
import { importBundledBeats } from '@/lib/server/beats'

export const runtime = 'nodejs'

// One-time import of the bundled data/beats.json into Firestore (libraryBeats). Shards that exist are skipped unless { force: true }.
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const b = await readJson(req).catch((): Record<string, unknown> => ({}))
    return importBundledBeats(adminDb(), b.force === true)
  })
}
