import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireStudent } from '@/lib/server/http'
import { pastGuests, ghash } from '@/lib/server/studioBook'
import { maskEmail } from '@/lib/studioBookCore'

export const runtime = 'nodejs'

// Type-ahead for the guest list: GET ?q= (2+ characters). Up to 5 results { id, name, emailMasked, kind: 'past' | 'member' }: your own past guests first, then
// members by name. The real email is NEVER returned (emailMasked is like r***@b***.edu): the server finds it again from the id when the booking or request
// is saved. Guests (the role) and members who switched suggestions off are left out. Students only; rate limited per person (30 a minute per server).
const hits = new Map<string, number[]>()
const MAX_PER_MIN = 30

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireStudent(req)
    const now = Date.now()
    const recent = (hits.get(t.uid) ?? []).filter(x => now - x < 60_000)
    if (recent.length >= MAX_PER_MIN) throw new HttpError(429, 'Slow down a little, then try again.')
    recent.push(now); hits.set(t.uid, recent)
    if (hits.size > 2000) hits.clear()

    const q = (new URL(req.url).searchParams.get('q') ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)
    if (q.length < 2) return { results: [] }
    const db = adminDb()
    const past = (await pastGuests(db, t.uid))
      .filter(p => p.name.toLowerCase().split(' ').some(w => w.startsWith(q)) || p.name.toLowerCase().startsWith(q) || p.email.startsWith(q))
      .slice(0, 5).map(p => ({ id: `g:${ghash(p.email)}`, name: p.name, emailMasked: maskEmail(p.email), kind: 'past' as const }))
    const out: { id: string; name: string; emailMasked: string; kind: 'past' | 'member' }[] = [...past]
    if (out.length < 5) {
      const snap = await db.collection('users').where('nameLower', '>=', q).where('nameLower', '<', `${q}`).select('firstName', 'lastName', 'email', 'level', 'suggestable').limit(12).get()
      const have = new Set(past.map(p => p.emailMasked + p.name))
      for (const d of snap.docs) {
        if (out.length >= 5) break
        const email = String(d.get('email') ?? '')
        if (d.id === t.uid || !email || d.get('level') === 'guest' || d.get('suggestable') === false) continue
        const name = [d.get('firstName'), d.get('lastName')].filter(Boolean).join(' ')
        if (!name || have.has(maskEmail(email) + name)) continue
        out.push({ id: `u:${d.id}`, name, emailMasked: maskEmail(email), kind: 'member' })
      }
    }
    return { results: out.slice(0, 5) }
  }, { 'Cache-Control': 'private, no-store' })
}
