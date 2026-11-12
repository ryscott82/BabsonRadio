import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireDirector } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { addBlockedWords, blocks, builtInCounts, findAll, loadConfig, saveBlocked } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// Directors and admins can read the list and add words; only admins can remove words or change the strictness.
// GET: staff's own extra words, how strict the show is, and how many built-in words each level has.
// GET ?check=some text: says which level a phrase lands in, whether it was starred out, and whether it would be blocked (at ?level= if given, otherwise the saved setting).
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const cfg = await loadConfig(adminDb())
    const params = new URL(req.url).searchParams
    const check = params.get('check')
    const lv = params.get('level')
    const level = lv === 'crude' || lv === 'explicit' ? lv : cfg.level // lets the page test a setting before it is saved
    if (check != null) {
      const hits = findAll(check.slice(0, 500), cfg.custom)
      const rank = (t: string) => ['crude', 'explicit', 'banned'].indexOf(t)
      const worst = hits.reduce<(typeof hits)[number] | null>((a, h) => (!a || rank(h.tier) > rank(a.tier) ? h : a), null)
      const stopper = hits.filter(h => blocks(h, level)).reduce<(typeof hits)[number] | null>((a, h) => (!a || rank(h.tier) > rank(a.tier) ? h : a), null)
      return { tier: worst?.tier ?? 'clean', starred: !!worst?.starred, blocked: !!stopper }
    }
    return { words: cfg.custom, level: cfg.level, counts: builtInCounts() }
  })
}

// Saves staff's own words and the level (a Director's save can only add words). The built-in lists are part of the code and cannot be edited here.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const admin = (await accessOf(t)).level === 'admin'
    const r = admin ? await saveBlocked(adminDb(), b.words, t.uid, b.level) : await addBlockedWords(adminDb(), b.words, t.uid, b.level)
    return { words: r.custom, level: r.level, counts: builtInCounts() }
  })
}
