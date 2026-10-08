import { adminDb } from '@/lib/server/admin'
import { handle, requireStaff } from '@/lib/server/http'

export const runtime = 'nodejs'

// The friends web: members linked when each has the other's number (mutual connections).
// Staff only, named by first and last name and username. Members in Invisible mode are left out.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const db = adminDb()
    const snap = await db.collectionGroup('connections').select('mutual').get()
    const pairs = new Set<string>()
    for (const d of snap.docs) {
      if (d.get('mutual') !== true) continue
      const a = d.ref.parent.parent?.id, b = d.id
      if (a && b && a !== b) pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
    const ids = [...new Set([...pairs].flatMap(p => p.split('|')))]
    const info = new Map<string, { name: string; username: string }>()
    const hidden = new Set<string>()
    for (let i = 0; i < ids.length; i += 100) {
      for (const u of await db.getAll(...ids.slice(i, i + 100).map(x => db.collection('users').doc(x)))) {
        if (!u.exists || u.get('invisible') === true) { hidden.add(u.id); continue }
        const name = [u.get('firstName') ?? u.get('displayName'), u.get('lastName')].filter(Boolean).join(' ')
        info.set(u.id, { name: name || 'Member', username: String(u.get('username') ?? '') })
      }
    }
    const edges = [...pairs].map(p => p.split('|')).filter(([a, b]) => !hidden.has(a) && !hidden.has(b))
    const deg = new Map<string, number>()
    for (const [a, b] of edges) { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1) }
    const nodes = [...deg].map(([id, friends]) => ({ id, friends, ...info.get(id)! })).sort((x, y) => y.friends - x.friends)
    const members = (await db.collection('users').count().get()).data().count
    return { members, connected: nodes.length, links: edges.length, nodes: nodes.slice(0, 400), edges: edges.filter(([a, b]) => nodes.slice(0, 400).some(n => n.id === a) && nodes.slice(0, 400).some(n => n.id === b)) }
  })
}
