import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { CATALOG } from '@/lib/server/earnedEmojis'

export const runtime = 'nodejs'

// Every reaction there is, and which ones this person has. Secret ones hide their name and rule until they are earned.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const d = await adminDb().collection('users').doc(t.uid).get()
    const got = new Set((d.get('earnedEmojis') as string[] | undefined) ?? [])
    const engagements = (d.get('engagements') as number | undefined) ?? 0
    const streak = (d.get('streak') as number | undefined) ?? 0
    const items = CATALOG.map(c => {
      const unlocked = c.free === true || got.has(c.emoji)
      const progress = c.emoji === ':br:' ? engagements : c.goal === 3 || c.goal === 7 ? streak : undefined
      if (c.mystery && !unlocked) return { emoji: c.emoji, name: 'Secret', how: 'A secret. Keep listening and see.', mystery: true, unlocked: false }
      return { emoji: c.emoji, name: c.name, how: c.how, mystery: c.mystery, unlocked, ...(unlocked || progress === undefined ? {} : { progress: Math.min(progress, c.goal ?? progress), goal: c.goal }) }
    })
    return { items, unlocked: items.filter(i => i.unlocked).length, total: items.length }
  })
}
