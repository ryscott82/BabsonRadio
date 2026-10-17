import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { PITTSBURGH } from '@/lib/reactionThemes'

/** A rule: while a matching song/artist/show is on, the reaction row becomes `emojis`. Matches are plain "contains", not regex. */
export interface Egg {
  id: string; name: string; enabled: boolean
  artist: string[]; title: string[]; show: string[]
  emojis: string[]
}

const DOC = ['config', 'easterEggs'] as const
export const SEED: Egg[] = [{
  id: 'pittsburgh', name: 'Pittsburgh (Mac Miller)', enabled: true,
  artist: ['mac miller'], title: [], show: [], emojis: [...PITTSBURGH],
}]

const list = (v: unknown, max = 12, len = 60): string[] =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string')
    .map(x => x.trim().toLowerCase().slice(0, len)).filter(Boolean).slice(0, max)

export function sanitizeEggs(raw: unknown): Egg[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 40).map((r, i) => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const emojis = (Array.isArray(o.emojis) ? o.emojis : []).filter((x): x is string => typeof x === 'string')
      .map(x => x.trim().slice(0, 24)).filter(Boolean).slice(0, 8)
    return {
      id: typeof o.id === 'string' && o.id ? o.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `egg-${i}` : `egg-${i}`,
      name: typeof o.name === 'string' ? o.name.trim().slice(0, 60) : 'Untitled',
      enabled: o.enabled !== false,
      artist: list(o.artist), title: list(o.title), show: list(o.show), emojis,
    }
  }).filter(e => e.emojis.length > 0)
}

let cache: { at: number; eggs: Egg[] } | null = null
export async function loadEggs(db: Firestore): Promise<Egg[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.eggs
  const snap = await db.collection(DOC[0]).doc(DOC[1]).get()
  const eggs = snap.exists ? sanitizeEggs(snap.get('eggs')) : SEED
  cache = { at: Date.now(), eggs }
  return eggs
}

export async function saveEggs(db: Firestore, raw: unknown, uid: string): Promise<Egg[]> {
  const eggs = sanitizeEggs(raw)
  await db.collection(DOC[0]).doc(DOC[1]).set({ eggs, updatedAt: Timestamp.now(), updatedBy: uid })
  cache = null
  return eggs
}

/** Every reaction any enabled rule can show (what POST /reactions accepts). */
export async function themedEmojis(db: Firestore): Promise<Set<string>> {
  return new Set((await loadEggs(db)).filter(e => e.enabled).flatMap(e => e.emojis))
}
