import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { findAll, loadConfig } from '@/lib/server/wordFilter'
import { clientIp } from '@/lib/signupLimits'
import { PHRASE_MAX, type PhraseTier } from '@/lib/phraseReference'

export const runtime = 'nodejs'

// The Explicit phrase reference. Anyone can use it, signed in or not (the studio booth has nobody signed in), so it is limited per IP.
// GET ?q=phrase -> { tier: 'clean' | 'crude' | 'explicit' | 'banned' }. Only the worst kind found is returned, never which word or the list.
const WINDOW_MS = 60_000, PER_IP = 30
const seen = new Map<string, number[]>()

function allow(ip: string, now: number): boolean {
  const key = ip || 'unknown'
  const recent = (seen.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  if (recent.length >= PER_IP) { seen.set(key, recent); return false }
  recent.push(now); seen.set(key, recent)
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some(t => now - t < WINDOW_MS)) seen.delete(k)
  return true
}

export async function GET(req: Request) {
  return handle(async () => {
    if (!allow(clientIp(req.headers), Date.now())) throw new HttpError(429, 'Too many checks. Wait a minute and try again.')
    const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, PHRASE_MAX)
    if (!q.trim()) throw new HttpError(400, 'Type a word or phrase first.')
    const { custom } = await loadConfig(adminDb())
    const rank: PhraseTier[] = ['clean', 'crude', 'explicit', 'banned']
    const tier = findAll(q, custom).reduce<PhraseTier>((w, h) => (rank.indexOf(h.tier) > rank.indexOf(w) ? h.tier : w), 'clean')
    return { tier }
  }, { 'Cache-Control': 'private, no-store' })
}
