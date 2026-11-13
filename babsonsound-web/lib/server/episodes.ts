import 'server-only'
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'

export interface EpisodeOut {
  id: string
  title: string
  showName: string
  showSlug: string
  category: string
  description: string
  youtubeID: string
  thumbnailURL: string
  duration: number
  publishedAt: number
  isNew: boolean
  /** 'public' = anyone on the internet; anything else (the default) = Babson students only. */
  visibility: 'public' | 'private'
  hostUids: string[]
  /** True for audio episodes (live-show archives) played from AzuraCast; false for YouTube ones. */
  audio: boolean
  contributors: string[]
}

/** The 11-character video id from any common YouTube link (watch, youtu.be, shorts, embed), or a bare id. */
export function youtubeId(input: string): string {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    let id = ''
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? ''
    else if (host.endsWith('youtube.com')) {
      id = u.searchParams.get('v') ?? ''
      if (!id) { const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/); id = m?.[1] ?? '' }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : ''
  } catch { return '' }
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export function toEpisode(id: string, d: DocumentData): EpisodeOut {
  const at = d.publishedAt as Timestamp | undefined
  const yt = String(d.youtubeID ?? '')
  return {
    id, title: String(d.title ?? ''), showName: String(d.showName ?? ''), showSlug: String(d.showSlug ?? ''),
    category: String(d.category ?? ''), description: String(d.description ?? ''), youtubeID: yt,
    thumbnailURL: String(d.thumbnailURL ?? '') || (yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : ''),
    duration: Number(d.duration) || 0, publishedAt: at?.toMillis?.() ?? 0, isNew: d.isNew === true,
    visibility: d.visibility === 'public' ? 'public' : 'private',
    hostUids: Array.isArray(d.hostUids) ? d.hostUids.map(String) : [],
    audio: !!d.azUniqueId, contributors: Array.isArray(d.contributors) ? d.contributors.map(String) : [],
  }
}

export async function recentEpisodes(db: Firestore, limit = 200): Promise<EpisodeOut[]> {
  const snap = await db.collection('episodes').orderBy('publishedAt', 'desc').limit(limit).get()
  return snap.docs.map(d => toEpisode(d.id, d.data()))
}

export async function episodesByIds(db: Firestore, ids: string[]): Promise<EpisodeOut[]> {
  const out: EpisodeOut[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const docs = await db.getAll(...ids.slice(i, i + 100).map(id => db.collection('episodes').doc(id)))
    for (const d of docs) if (d.exists) out.push(toEpisode(d.id, d.data()!))
  }
  return out
}

/** Everything the signed-in person saved or liked, used to guess what else they would enjoy. */
export async function myEpisodeIds(db: Firestore, uid: string): Promise<{ saved: string[]; liked: string[] }> {
  const [s, l] = await Promise.all([
    db.collection('users').doc(uid).collection('saved').orderBy('at', 'desc').limit(300).get(),
    db.collection('likes').where('uid', '==', uid).limit(300).get(),
  ])
  return { saved: s.docs.map(d => d.id), liked: l.docs.map(d => String(d.get('episodeId'))) }
}

/** "Based on your interests": episodes in the categories and shows you saved or liked, newest first within a score. */
export function recommend(all: EpisodeOut[], signals: EpisodeOut[], exclude: Set<string>, count = 12): { basedOnInterests: boolean; items: EpisodeOut[] } {
  const cat = new Map<string, number>(), show = new Map<string, number>()
  for (const e of signals) {
    if (e.category) cat.set(e.category, (cat.get(e.category) ?? 0) + 1)
    if (e.showSlug) show.set(e.showSlug, (show.get(e.showSlug) ?? 0) + 1)
  }
  const pool = all.filter(e => !exclude.has(e.id))
  if (!cat.size && !show.size) return { basedOnInterests: false, items: pool.slice(0, count) }
  const score = (e: EpisodeOut) => (show.get(e.showSlug) ?? 0) * 3 + (cat.get(e.category) ?? 0) * 2
  const ranked = pool.map((e, i) => ({ e, s: score(e), i })).sort((a, b) => b.s - a.s || a.i - b.i)
  const matched = ranked.filter(r => r.s > 0).map(r => r.e)
  const rest = ranked.filter(r => r.s === 0).map(r => r.e)
  return { basedOnInterests: matched.length > 0, items: [...matched, ...rest].slice(0, count) }
}
