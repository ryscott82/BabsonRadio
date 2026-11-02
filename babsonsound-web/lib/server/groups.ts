import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { normText } from '../terms'

// "3 people in your MKT 3500 class are listening". Counts only, never names. A group needs at least
// MIN_GROUP other people (so a count can't point at one person), and invisible people are left out.
const MIN_GROUP = 3

interface Row { uid: string; concentrations: string[]; gradYear: string; invisible: boolean }
const cache = new Map<string, { at: number; row: Row }>()
const TTL = 120_000
const MAX_CACHED = 5000
// The caller's own concentrations and class year, kept briefly so every poll does not re-read their user doc.
const meCache = new Map<string, { at: number; conc: string[]; year: string; exists: boolean }>()
export function resetGroupCaches() { cache.clear(); meCache.clear() }

async function rows(db: Firestore, uids: string[]): Promise<Row[]> {
  const now = Date.now()
  const out: Row[] = [], need: string[] = []
  for (const u of uids) {
    const c = cache.get(u)
    if (c && now - c.at < TTL) out.push(c.row); else need.push(u)
  }
  for (let i = 0; i < need.length; i += 300) {
    for (const s of await db.getAll(...need.slice(i, i + 300).map(id => db.collection('users').doc(id)), { fieldMask: ['concentrations', 'gradYear', 'invisible'] })) {
      if (!s.exists) continue
      const row: Row = {
        uid: s.id,
        concentrations: (s.get('concentrations') as string[] | undefined) ?? [], gradYear: s.get('gradYear') ?? '',
        invisible: s.get('invisible') === true,
      }
      if (cache.size > MAX_CACHED) cache.clear()
      cache.set(s.id, { at: now, row }); out.push(row)
    }
  }
  return out
}

export interface ListeningGroup { kind: 'concentration' | 'year'; label: string; count: number; text: string }

export async function listeningGroups(db: Firestore, myUid: string, listening: Set<string>): Promise<ListeningGroup[]> {
  let mine = meCache.get(myUid)
  if (!mine || Date.now() - mine.at >= TTL) {
    const me = await db.collection('users').doc(myUid).get()
    if (meCache.size > MAX_CACHED) meCache.clear()
    mine = { at: Date.now(), exists: me.exists, conc: (me.get('concentrations') as string[] | undefined) ?? [], year: String(me.get('gradYear') ?? '') }
    meCache.set(myUid, mine)
  }
  if (!mine.exists) return []
  const myConc = mine.conc.map(normText)
  const myYear = mine.year
  if (!myConc.length && !/^\d{4}$/.test(myYear)) return []

  const others = (await rows(db, [...listening].filter(u => u !== myUid))).filter(r => !r.invisible)
  const out: ListeningGroup[] = []
  const add = (kind: ListeningGroup['kind'], label: string, count: number, text: (n: number) => string) => {
    if (count >= MIN_GROUP) out.push({ kind, label, count, text: text(count) })
  }
  for (const c of myConc) add('concentration', c, others.filter(r => r.concentrations.map(normText).some(x => x.toLowerCase() === c.toLowerCase())).length, n => `${n} people concentrating in ${c} are listening`)
  if (/^\d{4}$/.test(myYear)) add('year', myYear, others.filter(r => r.gradYear === myYear).length, n => `${n} people in the class of ${myYear} are listening`)
  return out.sort((a, b) => b.count - a.count).slice(0, 4)
}
