import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireStudent } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { findAll, loadConfig } from '@/lib/server/wordFilter'
import { PHRASE_MAX, type PhraseTier } from '@/lib/phraseReference'

export const runtime = 'nodejs'

// The Explicit phrase reference: signed-in members who have done the training (E-board and Admins count as trained).
// GET ?q=phrase -> { tier: 'clean' | 'crude' | 'explicit' | 'banned' }. Only the worst kind found is returned, never which word or the list.
// Limited per person so it can't be used to walk through the list.
const WINDOW_MS = 60_000, PER_PERSON = 30
const seen = new Map<string, number[]>()

function allow(uid: string, now: number): boolean {
  const recent = (seen.get(uid) ?? []).filter(t => now - t < WINDOW_MS)
  if (recent.length >= PER_PERSON) { seen.set(uid, recent); return false }
  recent.push(now); seen.set(uid, recent)
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some(t => now - t < WINDOW_MS)) seen.delete(k)
  return true
}

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireStudent(req)
    const a = await accessOf(t)
    if (!a.studio && !a.radio) throw new HttpError(403, 'The phrase reference is for trained members. Finish the training at babsonradio.com/training first.')
    if (!allow(t.uid, Date.now())) throw new HttpError(429, 'Too many checks. Wait a minute and try again.')
    const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, PHRASE_MAX)
    if (!q.trim()) throw new HttpError(400, 'Type a word or phrase first.')
    const { custom } = await loadConfig(adminDb())
    const rank: PhraseTier[] = ['clean', 'crude', 'explicit', 'banned']
    const tier = findAll(q, custom).reduce<PhraseTier>((w, h) => (rank.indexOf(h.tier) > rank.indexOf(w) ? h.tier : w), 'clean')
    return { tier }
  }, { 'Cache-Control': 'private, no-store' })
}
