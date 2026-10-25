import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff } from '@/lib/server/http'
import { blocks, builtInCounts, findAll, loadConfig, saveBlocked } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// GET: staff's own extra words, how strict the show is, and how many built-in words each level has.
// GET ?check=some text: says which level a phrase lands in, whether it was starred out, and whether it would be blocked right now.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const cfg = await loadConfig(adminDb())
    const check = new URL(req.url).searchParams.get('check')
    if (check != null) {
      const hits = findAll(check.slice(0, 500), cfg.custom)
      const rank = (t: string) => ['crude', 'explicit', 'banned'].indexOf(t)
      const worst = hits.reduce<(typeof hits)[number] | null>((a, h) => (!a || rank(h.tier) > rank(a.tier) ? h : a), null)
      const stopper = hits.filter(h => blocks(h, cfg.level)).reduce<(typeof hits)[number] | null>((a, h) => (!a || rank(h.tier) > rank(a.tier) ? h : a), null)
      return { tier: worst?.tier ?? 'clean', starred: !!worst?.starred, blocked: !!stopper }
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
