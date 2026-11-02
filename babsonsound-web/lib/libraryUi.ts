// Words and small rules for the admin Music library pages (pure, so they can be tested).

export interface WorkerStatus { online: boolean; lastSeen: number | null; version: string | null; currentJobId: string | null; liveNow: boolean }
export interface WorkerJob {
  id: string; type: string; params: Record<string, unknown>; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  createdAt: number; startedAt: number | null; finishedAt: number | null; progress: { done: number; total: number; note: string }; error: string | null
}
export interface Tags { title: string; artist: string; album: string }
export interface WorkerProposal {
  songId: string; current: Partial<Tags>; proposed: Partial<Tags> & { artUrl?: string; confidence?: number; source?: string }
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'
  beat: { bpm: number; firstBeat: number } | null; loudness: { lufs: number; gainDb: number } | null; error: string | null; updatedAt: number
}

export const JOB_LABEL: Record<string, string> = {
  'library.scan': 'Scan library', 'library.fetch_metadata': 'Fetch metadata', 'library.fetch_art': 'Fetch covers',
  'library.analyze_beats': 'Analyze beats', 'library.measure_loudness': 'Measure loudness', 'library.apply': 'Apply approved',
  'library.undo': 'Undo last apply', 'schedule.reconcile': 'Check schedule',
}
/** The run buttons, in the order they are shown. */
export const RUN_TYPES = ['library.scan', 'library.fetch_metadata', 'library.fetch_art', 'library.analyze_beats', 'library.measure_loudness', 'library.apply', 'library.undo'] as const

export const LOW_CONFIDENCE = 0.7

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} days ago`
}

/** One plain sentence about the studio PC. */
export function statusLine(s: WorkerStatus, now = Date.now()): string {
  if (s.online) return `Studio PC online.${s.liveNow ? ' A live show is on air.' : ''}`
  return `Studio PC offline, ${s.lastSeen ? `last seen ${ago(s.lastSeen, now)}` : 'never seen'}. Jobs wait until it is back.`
}

export const isActive = (j: { status: string }) => j.status === 'queued' || j.status === 'running'
/** Which job types cannot be started right now because one of that type is already queued or running. */
export const busyTypes = (jobs: WorkerJob[]) => new Set(jobs.filter(isActive).map(j => j.type))

export function progressText(j: WorkerJob): string {
  if (j.status === 'queued') return 'Waiting for the studio PC'
  const { done, total, note } = j.progress
  return `${total > 0 ? `${done} of ${total}` : `${done} done`}${note ? `, ${note}` : ''}`
}
export const progressPct = (j: WorkerJob) => (j.progress.total > 0 ? Math.min(100, Math.round((j.progress.done / j.progress.total) * 100)) : 0)

/** The fields that would change, as "label: old to new". Fields that stay the same are left out. */
export function changedFields(p: WorkerProposal): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = []
  for (const [k, label] of [['title', 'Title'], ['artist', 'Artist'], ['album', 'Album']] as const) {
    const from = (p.current[k] ?? '').trim(), to = (p.proposed[k] ?? '').trim()
    if (to && to !== from) out.push({ label, from, to })
  }
  return out
}

export const pct = (c: number | undefined) => `${Math.round((c ?? 0) * 100)}%`
export const isLow = (p: WorkerProposal) => (p.proposed.confidence ?? 0) < LOW_CONFIDENCE
