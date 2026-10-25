import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff } from '@/lib/server/http'
import { builtInCounts, findBad, loadConfig, saveBlocked } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// GET: staff's own extra words, how strict the show is, and how many built-in words each level has.
// GET ?check=some text: says which level a phrase lands in (to try the filter without sending anything).
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const cfg = await loadConfig(adminDb())
    const check = new URL(req.url).searchParams.get('check')
    if (check != null) {
      const hit = findBad(check.slice(0, 500), cfg.custom)
      return { tier: hit?.tier ?? 'clean', blocked: !!hit && (hit.tier === 'banned' || hit.tier === 'explicit' || cfg.level === 'crude') }
    }
    return { words: cfg.custom, level: cfg.level, counts: builtInCounts() }
  })
}

// Saves staff's own words and the level. The built-in lists are part of the code and cannot be edited here.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const r = await saveBlocked(adminDb(), b.words, t.uid, b.level)
    return { words: r.custom, level: r.level, counts: builtInCounts() }
  })
}
