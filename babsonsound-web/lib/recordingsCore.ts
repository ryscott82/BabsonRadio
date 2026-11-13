// Pure recording rules (no server imports) so the tests can run them.
/** Only plain relative file paths inside AzuraCast's media folder. */
export const cleanPath = (v: unknown): string => {
  const p = typeof v === 'string' ? v.trim() : ''
  return p && p.length <= 300 && !p.startsWith('/') && !p.includes('..') && !p.includes('\\') && !/[\u0000-\u001f]/.test(p) ? p : ''
}

/** What is wrong with attaching this recording to this show, as a sentence; null when it is fine. Pure so the tests cover it. */
export function attachProblem(i: { cleanConfirmed: unknown; recOwner: string; reqOwner: string; uid: string; recStatus: string; reqType: string; reqStatus: string; reqStart: number; now: number }): { message: string; code: string; status: number } | null {
  if (i.cleanConfirmed !== true) return { message: 'Listen to the whole recording and tick the box to confirm it is clean.', code: 'BR-REC-002', status: 400 }
  if (i.recOwner !== i.uid) return { message: 'Recording not found.', code: 'BR-REC-001', status: 404 }
  if (i.recStatus !== 'uploaded' && i.recStatus !== 'attached') return { message: 'This recording is not ready yet. Wait until it has finished uploading.', code: 'BR-REC-001', status: 409 }
  if (i.reqOwner !== i.uid || i.reqType !== 'prerecorded' || (i.reqStatus !== 'pending' && i.reqStatus !== 'approved') || i.reqStart <= i.now) {
    return { message: 'Attach recordings to an upcoming pre-recorded show of yours.', code: 'BR-REC-003', status: 409 }
  }
  return null
}

/** A recording sent by the studio PC on behalf of whoever made it (they may have signed out, or the site was down for a while).
 *  The PC proves itself with a fresh signed nonce; the person is the one in the control token this site signed for them, which must
 *  allow recording (r: the Studio badge at that time) and may be up to maxAgeMs past its end. Returns the uid, or a problem. */
export function pcRecorderProblem(c: { u: string; r?: boolean; l?: boolean; exp: number } | null, now: number, maxAgeMs: number, live = false): { message: string; code: string; status: number } | null {
  if (!c || !c.u) return { message: 'Sign in again on the studio PC.', code: 'BR-BTH-002', status: 401 }
  if (c.r !== true && !(live && c.l === true)) return { message: 'Finish studio training to record in the studio.', code: 'BR-BKG-007', status: 403 }
  if (c.exp < now - maxAgeMs) return { message: 'This recording is too old to add. Ask an admin to add it from AzuraCast.', code: 'BR-BTH-002', status: 401 }
  return null
}

/** The id the studio PC gives a recording, used as the document id so a retried call never makes a second one. */
export const cleanRecordingId = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9]{12,40}$/.test(v) ? v : '')

// ── Live shows archived by the studio PC ──
export const SHOW_CATEGORIES = ['Music', 'Interview', 'Podcast', 'Talk', 'News'] as const
export interface LiveShowInfo { hosts: string[]; description: string; category: string; startedAt: number; endedAt: number }
const oneLine = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)

/** The show info the PC sends with a live recording, made safe. Null when it is not a live show. */
export function cleanLiveShow(v: unknown): LiveShowInfo | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const hosts: string[] = []
  for (const h of Array.isArray(o.hosts) ? o.hosts : []) {
    const n = oneLine(h, 60)
    if (n && !hosts.some(x => x.toLowerCase() === n.toLowerCase())) hosts.push(n)
    if (hosts.length >= 12) break
  }
  const cat = SHOW_CATEGORIES.find(c => c.toLowerCase() === oneLine(o.category, 30).toLowerCase()) ?? ''
  const t = (x: unknown) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n > 1_000_000_000_000 && n < 4_000_000_000_000 ? n : 0 }
  return { hosts, description: oneLine(o.description, 500), category: cat, startedAt: t(o.startedAt), endedAt: t(o.endedAt) }
}

/** The library episode for a finished live recording. Pure so the tests cover it. Private (Babson students only) until an admin makes it public. */
export function liveEpisodeDoc(r: { title: string; uid: string; durationSec: number; azuracastPath: string; mediaId: number; uniqueId: string; live: LiveShowInfo; recordingId: string; crewUids?: string[] }) {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return {
    title: r.title, showName: r.title, showSlug: slug, category: r.live.category, description: r.live.description,
    youtubeID: '', thumbnailURL: '', duration: r.durationSec, isNew: true, visibility: 'private' as const,
    hostUids: [...new Set([r.uid, ...(r.crewUids ?? [])].filter(Boolean))].slice(0, 9), contributors: r.live.hosts, source: 'live', recordingId: r.recordingId,
    audioPath: r.azuracastPath, azMediaId: r.mediaId, azUniqueId: r.uniqueId,
  }
}
