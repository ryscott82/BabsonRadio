import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { buildScheduleFeed, type ScheduleItem } from './scheduleFeed'
import { occurrenceId } from './host'

// What is on air right now, and the live extras around it (a note from the host, reactions, set list votes, ratings).
// Everything is keyed by the "occurrence": one airing of one show, like weekly-Abc_1760400000000.

const RANK = { event: 0, slot: 1, weekly: 2, auto: 3 } as const

export interface OnAir {
  item: ScheduleItem
  /** One airing of one show, e.g. weekly-abc_1760400000000. Same id the host panel and set lists use. */
  occId: string
  isShow: boolean
}

export const occIdOf = (i: Pick<ScheduleItem, 'reminderKey' | 'startAt'>) => occurrenceId({ key: i.reminderKey, startAt: i.startAt })

export async function currentOnAir(db: Firestore, now = Date.now()): Promise<OnAir | null> {
  const items = (await buildScheduleFeed(db, { days: 1, showStudentHosts: false, now }))
    .filter(i => i.startAt <= now && i.endAt > now)
    .sort((a, b) => RANK[a.source] - RANK[b.source])
  const item = items[0]
  return item ? { item, occId: occIdOf(item), isShow: item.source !== 'auto' } : null
}

export interface LiveNote { headline: string; message: string; updatedAt: number; by: string }

export async function getNote(db: Firestore, occId: string, now = Date.now()): Promise<LiveNote | null> {
  const d = await db.collection('liveNotes').doc(occId).get()
  if (!d.exists) return null
  const exp = (d.get('expiresAt') as Timestamp | undefined)?.toMillis() ?? 0
  if (exp < now) return null
  const headline = String(d.get('headline') ?? ''), message = String(d.get('message') ?? '')
  if (!headline && !message) return null
  return { headline, message, updatedAt: (d.get('updatedAt') as Timestamp).toMillis(), by: String(d.get('byName') ?? '') }
}

// ── Reactions ────────────────────────────────────────────────
export const EMOJIS = ['🔥', '❤️', '🎉', '👏'] as const
export type Emoji = (typeof EMOJIS)[number]
const minuteOf = (ms: number) => Math.floor(ms / 60_000)

export interface ReactionSummary { recent: Record<string, number>; total: Record<string, number> }

const rxCache = new Map<string, { at: number; v: ReactionSummary }>()

export async function reactionSummary(db: Firestore, occId: string, now = Date.now()): Promise<ReactionSummary> {
  const hit = rxCache.get(occId)
  if (hit && now - hit.at < 4_000) return hit.v
  const d = await db.collection('reactions').doc(occId).get()
  const total: Record<string, number> = {}, recent: Record<string, number> = {}
  const counts = (d.get('counts') ?? {}) as Record<string, number>
  for (const e of EMOJIS) { total[e] = counts[e] ?? 0; recent[e] = 0 }
  const buckets = (d.get('buckets') ?? {}) as Record<string, Record<string, number>>
  const cutoff = minuteOf(now) - 2 // last ~3 minutes
  for (const [m, byEmoji] of Object.entries(buckets)) {
    if (Number(m) < cutoff) continue
    for (const e of EMOJIS) recent[e] += byEmoji[e] ?? 0
  }
  const v = { recent, total }
  rxCache.set(occId, { at: now, v })
  return v
}

export const bucketMinute = minuteOf

// ── Set list votes ───────────────────────────────────────────
/** Stable short id for a song line, so a vote survives the host re-ordering or editing other lines. */
export function songId(line: string): string {
  let h = 5381
  const s = line.trim().toLowerCase().replace(/\s+/g, ' ')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function parseSongs(text: string): { id: string; text: string }[] {
  const seen = new Set<string>()
  return text.split('\n').map(l => l.trim()).filter(Boolean).flatMap(l => {
    const id = songId(l)
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, text: l }]
  }).slice(0, 80)
}
