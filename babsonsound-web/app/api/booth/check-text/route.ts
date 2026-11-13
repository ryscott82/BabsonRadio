import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser, str } from '@/lib/server/http'
import { assertClean } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// The booth's show name, host names and track title go through the blocked-word list before they are saved or shown: { texts: string[] }.
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(req)
    const b = await readJson(req)
    const texts = (Array.isArray(b.texts) ? b.texts : []).slice(0, 20).map(t => str(t, 300)).filter(Boolean)
    await assertClean(adminDb(), ...texts)
    return { ok: true }
  })
}
