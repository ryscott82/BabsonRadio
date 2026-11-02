import { createHmac, timingSafeEqual } from 'node:crypto'

// Library worker: the studio PC runs the slow library jobs (scan, fetch metadata and art, beats, loudness, apply to AzuraCast) so the
// website never has to. Pure rules live here (no database, no 'server-only') so the tests can run them directly.
// Server side: lib/server/worker.ts. Contract for the PC and the admin page: LIBRARY_WORKER.md.

export const WORKER_UID = 'studio-worker'
export const TOKEN_TTL_SEC = 3600
export const NONCE_MAX_AGE_MS = 2 * 60_000
/** The worker counts as online while its last heartbeat is newer than this. It beats every 5 minutes (and at each job start and end). */
export const ONLINE_MS = 11 * 60_000
export const PAGE_SIZE = 50
export const MAX_IDS = 400

// ── jobs ──
export const JOB_TYPES = [
  'library.scan', 'library.fetch_metadata', 'library.fetch_art', 'library.analyze_beats', 'library.measure_loudness',
  'library.apply', 'library.undo', 'schedule.reconcile',
] as const
export type JobType = (typeof JOB_TYPES)[number]
export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const isJobType = (t: unknown): t is JobType => typeof t === 'string' && (JOB_TYPES as readonly string[]).includes(t)

export const APPLY_KINDS = ['metadata', 'art', 'amplify', 'beat'] as const
export type ApplyKind = (typeof APPLY_KINDS)[number]
/** The only fields a change record may name. */
export const CHANGE_FIELDS = ['title', 'artist', 'album', 'art', 'amplify', 'beat'] as const
export type ChangeField = (typeof CHANGE_FIELDS)[number]

const id = (v: unknown) => (typeof v === 'string' || typeof v === 'number') && String(v).length > 0 && String(v).length <= 64 ? String(v) : null
const idList = (v: unknown, max: number): string[] | null => {
  if (!Array.isArray(v) || v.length > max) return null
  const out = v.map(id)
  return out.every((x): x is string => x !== null) ? out : null
}

type Clean = { ok: true; params: Record<string, unknown> } | { ok: false; why: string }

/** Checks a job's params against its type. Unknown keys are refused; nothing from the caller is stored as is. */
export function cleanJobParams(type: JobType, raw: unknown): Clean {
  const src = raw === undefined || raw === null ? {} : raw
  if (typeof src !== 'object' || Array.isArray(src)) return { ok: false, why: 'params must be an object.' }
  const p = src as Record<string, unknown>
  const allowed: Record<JobType, string[]> = {
    'library.scan': ['full'], 'library.fetch_metadata': ['songIds', 'onlyMissing'], 'library.fetch_art': ['songIds', 'onlyMissing'],
    'library.analyze_beats': ['songIds', 'force'], 'library.measure_loudness': ['songIds', 'targetLufs'],
    'library.apply': ['proposalIds', 'kinds'], 'library.undo': ['jobId', 'changeIds'], 'schedule.reconcile': [],
  }
  const extra = Object.keys(p).filter(k => !allowed[type].includes(k))
  if (extra.length) return { ok: false, why: `Unknown params for ${type}: ${extra.join(', ')}.` }
  const out: Record<string, unknown> = {}
  const bool = (k: string) => { if (p[k] === undefined) return true; if (typeof p[k] !== 'boolean') return false; out[k] = p[k]; return true }
  const ids = (k: string, max: number) => { if (p[k] === undefined) return true; const l = idList(p[k], max); if (!l) return false; out[k] = l; return true }
  switch (type) {
    case 'library.scan': if (!bool('full')) return { ok: false, why: 'full must be true or false.' }; break
    case 'library.fetch_metadata': case 'library.fetch_art':
      if (!ids('songIds', 5000) || !bool('onlyMissing')) return { ok: false, why: 'songIds must be up to 5000 ids; onlyMissing true or false.' }; break
    case 'library.analyze_beats': if (!ids('songIds', 5000) || !bool('force')) return { ok: false, why: 'songIds must be up to 5000 ids; force true or false.' }; break
    case 'library.measure_loudness':
      if (!ids('songIds', 5000)) return { ok: false, why: 'songIds must be up to 5000 ids.' }
      if (p.targetLufs !== undefined) { const n = Number(p.targetLufs); if (!Number.isFinite(n) || n < -30 || n > -5) return { ok: false, why: 'targetLufs must be between -30 and -5.' }; out.targetLufs = n }
      break
    case 'library.apply': {
      if (!ids('proposalIds', 500)) return { ok: false, why: 'proposalIds must be up to 500 ids.' }
      if (p.kinds !== undefined) {
        if (!Array.isArray(p.kinds) || !p.kinds.length || !p.kinds.every(k => (APPLY_KINDS as readonly string[]).includes(String(k)))) return { ok: false, why: `kinds must be a list of: ${APPLY_KINDS.join(', ')}.` }
        out.kinds = [...new Set(p.kinds.map(String))]
      }
      break
    }
    case 'library.undo': {
      if (p.jobId !== undefined) { const j = id(p.jobId); if (!j) return { ok: false, why: 'jobId is not valid.' }; out.jobId = j }
      if (!ids('changeIds', 500)) return { ok: false, why: 'changeIds must be up to 500 ids.' }
      if (out.jobId === undefined && out.changeIds === undefined) return { ok: false, why: 'Say what to undo: a jobId or changeIds.' }
      break
    }
    case 'schedule.reconcile': break
  }
  return { ok: true, params: out }
}

// ── signed requests from the PC (same style as STUDIO_PC_SECRET: a fresh nonce signed with the shared secret) ──
const mac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest()
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

/** Hex signature the PC sends in x-worker-sig for a nonce "<ms>.<random>" sent in x-worker-nonce. */
export const workerSig = (secret: string, nonce: string) => mac(secret, `worker:${nonce}`).toString('hex')

export function verifyWorkerSig(secret: string, nonce: string, sig: string, now = Date.now()): boolean {
  if (secret.length < 32) return false
  const m = /^(\d{12,14})\.[A-Za-z0-9]{8,64}$/.exec(nonce)
  if (!m || Math.abs(now - Number(m[1])) > NONCE_MAX_AGE_MS) return false
  if (!/^[0-9a-f]{64}$/.test(sig)) return false
  return same(Buffer.from(sig, 'hex'), Buffer.from(workerSig(secret, nonce), 'hex'))
}

/** Remembers nonces for the length of the allowed window, so a captured request cannot be replayed on this server instance. */
export function nonceFresh(seen: Map<string, number>, nonce: string, now = Date.now()): boolean {
  for (const [k, t] of seen) if (now - t > NONCE_MAX_AGE_MS * 2) seen.delete(k)
  if (seen.has(nonce)) return false
  seen.set(nonce, now)
  return true
}

// ── proposals ──
export const PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'applied', 'failed'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export interface Tags { title: string; artist: string; album: string }
export interface Proposal {
  songId: string
  current: Tags
  proposed: Tags & { artUrl?: string; confidence: number; source: string }
  status: ProposalStatus
  beat?: { bpm: number; firstBeat: number }
  loudness?: { lufs: number; gainDb: number }
  updatedAt?: unknown
}

const norm = (x: string) => x.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
/** Search key stored on each proposal (artist then title, letters and digits only). The admin search matches the start of it. */
export const sortKeyOf = (artist: string, title: string) => `${norm(artist)}|${norm(title)}`
/** Turns what an admin typed into the prefix to match against sortKey. */
export const searchPrefix = (q: string) => { const t = q.trim(); const i = t.indexOf('|'); return i < 0 ? norm(t) : `${norm(t.slice(0, i))}|${norm(t.slice(i + 1))}` }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** What an admin may change on a proposal. Everything else is refused. */
export function cleanProposalFields(raw: unknown): { ok: true; fields: Partial<Tags & { artUrl: string }> } | { ok: false; why: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, why: 'fields must be an object.' }
  const f = raw as Record<string, unknown>
  const bad = Object.keys(f).filter(k => !['title', 'artist', 'album', 'artUrl'].includes(k))
  if (bad.length) return { ok: false, why: `Can't edit: ${bad.join(', ')}.` }
  const out: Partial<Tags & { artUrl: string }> = {}
  for (const k of ['title', 'artist', 'album'] as const) {
    if (f[k] === undefined) continue
    if (typeof f[k] !== 'string') return { ok: false, why: `${k} must be text.` }
    const v = str(f[k], 200)
    if (k !== 'album' && !v) return { ok: false, why: `${k} can't be empty.` }
    out[k] = v
  }
  if (f.artUrl !== undefined) {
    const u = str(f.artUrl, 500)
    if (u && !/^https:\/\/[^\s]+$/.test(u)) return { ok: false, why: 'artUrl must be an https link.' }
    out.artUrl = u
  }
  return Object.keys(out).length ? { ok: true, fields: out } : { ok: false, why: 'Nothing to change.' }
}

// ── apply: only APPROVED proposals ──
export interface PlannedChange { field: ChangeField; new: string | number | { bpm: number; firstBeat: number } }
export interface ApplyAction { proposalId: string; songId: string; kind: ApplyKind; changes: PlannedChange[] }

/** The AzuraCast changes to make for these proposals. A proposal that is not approved produces nothing, whatever else is true of it. */
export function planApply(proposals: Proposal[], kinds: readonly ApplyKind[] = APPLY_KINDS): ApplyAction[] {
  const out: ApplyAction[] = []
  for (const p of proposals) {
    if (p.status !== 'approved') continue
    const meta: PlannedChange[] = []
    for (const f of ['title', 'artist', 'album'] as const) {
      const v = p.proposed[f]
      if (typeof v === 'string' && v !== '' && v !== p.current[f]) meta.push({ field: f, new: v })
    }
    if (kinds.includes('metadata') && meta.length) out.push({ proposalId: p.songId, songId: p.songId, kind: 'metadata', changes: meta })
    if (kinds.includes('art') && p.proposed.artUrl && /^https:\/\//.test(p.proposed.artUrl)) out.push({ proposalId: p.songId, songId: p.songId, kind: 'art', changes: [{ field: 'art', new: p.proposed.artUrl }] })
    const g = p.loudness?.gainDb
    if (kinds.includes('amplify') && typeof g === 'number' && Number.isFinite(g) && Math.abs(g) <= 24) out.push({ proposalId: p.songId, songId: p.songId, kind: 'amplify', changes: [{ field: 'amplify', new: Math.round(g * 10) / 10 }] })
    const b = p.beat
    if (kinds.includes('beat') && b && b.bpm >= 50 && b.bpm <= 220 && b.firstBeat >= 0) out.push({ proposalId: p.songId, songId: p.songId, kind: 'beat', changes: [{ field: 'beat', new: { bpm: b.bpm, firstBeat: b.firstBeat } }] })
  }
  return out
}

// ── change log (libraryChanges, append only) and undo ──
export interface Change {
  id: string; songId: string; field: ChangeField; old: unknown; new: unknown; by: string; at: number; jobId: string
  /** Set on the record an undo writes: the id of the change it reverses. */
  undoOf?: string
  /** Beats are keyed by artist and title. */
  artist?: string; title?: string
}

/** Why a change report from the PC is refused, or null when it is fine. `proposalStatus` is the song's proposal at this moment. */
export function changeRefusal(job: { type: string; status: string }, c: { field: unknown; undoOf?: unknown; artist?: unknown; title?: unknown }, proposalStatus: string | undefined): string | null {
  if (job.status !== 'running') return 'The job is not running.'
  if (!(CHANGE_FIELDS as readonly string[]).includes(String(c.field))) return 'Unknown field.'
  if (c.field === 'beat' && (!str(c.artist, 200) || !str(c.title, 200))) return 'A beat change needs artist and title.'
  if (job.type === 'library.apply') {
    if (c.undoOf !== undefined) return 'An apply job cannot undo.'
    if (proposalStatus !== 'approved' && proposalStatus !== 'applied') return 'That song has no approved proposal.'
    return null
  }
  if (job.type === 'library.undo') return typeof c.undoOf === 'string' && c.undoOf ? null : 'An undo change must say which change it reverses (undoOf).'
  return 'This kind of job does not change the library.'
}

/** Steps that put things back: newest first, one per change, skipping changes already undone and undo records themselves. */
export function planUndo(changes: Change[], pick: { jobId?: string; changeIds?: string[] }): { changeId: string; songId: string; field: ChangeField; restore: unknown; artist?: string; title?: string }[] {
  const undone = new Set(changes.filter(c => c.undoOf).map(c => c.undoOf as string))
  const ids = pick.changeIds ? new Set(pick.changeIds) : null
  return changes
    .filter(c => !c.undoOf && !undone.has(c.id) && (pick.jobId ? c.jobId === pick.jobId : true) && (ids ? ids.has(c.id) : true))
    .sort((a, b) => b.at - a.at)
    .map(c => ({ changeId: c.id, songId: c.songId, field: c.field, restore: c.old, ...(c.artist ? { artist: c.artist } : {}), ...(c.title ? { title: c.title } : {}) }))
}

/** Undo records use this id, so a change can be undone only once (creating it a second time fails). */
export const undoRecordId = (changeId: string) => `undo_${changeId}`

// ── beats storage (libraryBeats/{shard}) ──
export const BEAT_SHARD_MAX_BYTES = 450_000
/** One document per first character of the key (a to z, 0 to 9, or "_"), each far below Firestore's 1 MB limit. */
export const beatShard = (key: string) => (/^[a-z0-9]/.test(key) ? key[0] : '_')
export const beatKey = (artist: string, title: string) => sortKeyOf(artist, title)
