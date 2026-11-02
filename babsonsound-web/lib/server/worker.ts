import 'server-only'
import { FieldPath, FieldValue, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore'
import { adminAuth } from './admin'
import { HttpError } from './http'
import {
  MAX_IDS, ONLINE_MS, PAGE_SIZE, PROPOSAL_STATUSES, TOKEN_TTL_SEC, WORKER_UID,
  beatKey, changeRefusal, cleanJobParams, cleanProposalFields, isJobType, nonceFresh, searchPrefix, undoRecordId, verifyWorkerSig,
  type ChangeField, type ProposalStatus,
} from '../worker'
import { writeBeats } from './beats'

// Library worker server side. Collections: workerJobs, workerProposals, workerStatus (the PC reads and writes these directly, see firestore.rules),
// libraryChanges (append only, written here from the PC's reports) and libraryBeats (see ./beats). Everything else the PC needs goes through
// /api/worker/*. Contract: LIBRARY_WORKER.md.

export const workerSecret = () => {
  const s = process.env.WORKER_SECRET ?? ''
  if (s.length < 32) throw new HttpError(503, 'The library worker is not set up yet.', 'BR-LIB-001')
  return s
}

const ms = (v: unknown): number => (v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as Timestamp).toMillis() : typeof v === 'number' ? v : 0)
const seenNonces = new Map<string, number>()
const fails: number[] = []

function tooManyFails(now: number) {
  while (fails.length && now - fails[0] > 60_000) fails.shift()
  if (fails.length >= 20) throw new HttpError(429, 'Too many tries. Wait a minute.', 'BR-LIB-013')
}

/** Checks x-worker-nonce / x-worker-sig (the secret itself is never sent). */
export function verifySigned(req: Request, now = Date.now()) {
  const secret = workerSecret()
  tooManyFails(now)
  const nonce = req.headers.get('x-worker-nonce') ?? '', sig = req.headers.get('x-worker-sig') ?? ''
  if (!verifyWorkerSig(secret, nonce, sig, now) || !nonceFresh(seenNonces, nonce, now)) {
    fails.push(now)
    throw new HttpError(401, 'The studio PC was not accepted.', 'BR-LIB-002')
  }
}

/** The PC: either its custom-token sign-in (uid studio-worker, claim worker) or a signed request. */
export async function requireWorker(req: Request) {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer (.+)$/i)
  if (m) {
    try {
      const t = await adminAuth().verifyIdToken(m[1])
      if (t.uid === WORKER_UID && t.worker === true) return
    } catch { /* fall through to the signed check */ }
    if (!req.headers.get('x-worker-sig')) throw new HttpError(401, 'The studio PC was not accepted.', 'BR-LIB-002')
  }
  verifySigned(req)
}

/** A Firebase custom token for the PC: uid studio-worker, claim worker: true. Firebase makes custom tokens valid for one hour. */
export async function mintWorkerToken() {
  const token = await adminAuth().createCustomToken(WORKER_UID, { worker: true })
  return { token, expiresAt: Date.now() + TOKEN_TTL_SEC * 1000 }
}

// ── jobs ──
const JOBS = 'workerJobs', PROPOSALS = 'workerProposals', CHANGES = 'libraryChanges'

export async function createJob(db: Firestore, uid: string, typeRaw: unknown, paramsRaw: unknown) {
  if (!isJobType(typeRaw)) throw new HttpError(400, 'That kind of job is not allowed.', 'BR-LIB-003')
  const p = cleanJobParams(typeRaw, paramsRaw)
  if (!p.ok) throw new HttpError(400, p.why, 'BR-LIB-004')
  const busy = await db.collection(JOBS).where('type', '==', typeRaw).where('status', 'in', ['queued', 'running']).limit(1).get()
  if (!busy.empty) throw new HttpError(409, 'A job of this kind is already queued or running.', 'BR-LIB-005')
  const ref = db.collection(JOBS).doc()
  await ref.set({
    type: typeRaw, params: p.params, status: 'queued', createdBy: uid, createdAt: Timestamp.now(),
    startedAt: null, finishedAt: null, progress: { done: 0, total: 0, note: '' }, error: null,
  })
  return { id: ref.id }
}

const jobOut = (d: FirebaseFirestore.DocumentSnapshot) => ({
  id: d.id, type: d.get('type'), params: d.get('params') ?? {}, status: d.get('status'), createdBy: d.get('createdBy') ?? '',
  createdAt: ms(d.get('createdAt')), startedAt: ms(d.get('startedAt')) || null, finishedAt: ms(d.get('finishedAt')) || null,
  progress: d.get('progress') ?? { done: 0, total: 0, note: '' }, error: d.get('error') ?? null,
})

/** Newest first, 25 per page. `before` is the createdAt (ms) of the last job on the previous page. */
export async function listJobs(db: Firestore, before?: number) {
  let q: Query = db.collection(JOBS).orderBy('createdAt', 'desc')
  if (before) q = q.startAfter(Timestamp.fromMillis(before))
  const snap = await q.limit(25).get()
  const items = snap.docs.map(jobOut)
  return { items, next: items.length === 25 ? items[items.length - 1].createdAt : null }
}

export async function cancelJob(db: Firestore, id: string) {
  const ref = db.collection(JOBS).doc(id)
  return db.runTransaction(async tx => {
    const d = await tx.get(ref)
    if (!d.exists) throw new HttpError(404, 'That job does not exist.', 'BR-LIB-006')
    if (d.get('status') !== 'queued' && d.get('status') !== 'running') throw new HttpError(409, 'That job has already finished.', 'BR-LIB-007')
    tx.update(ref, { status: 'cancelled', finishedAt: Timestamp.now() })
    return { ok: true }
  })
}

// ── proposals ──
const propOut = (d: FirebaseFirestore.DocumentSnapshot) => ({
  songId: d.id, current: d.get('current') ?? {}, proposed: d.get('proposed') ?? {}, status: d.get('status'),
  beat: d.get('beat') ?? null, loudness: d.get('loudness') ?? null, error: d.get('error') ?? null, updatedAt: ms(d.get('updatedAt')),
})

/**
 * 50 per page, read once per call (not live). Without q: newest first, `after` = updatedAt of the last item.
 * With q: ordered by artist|title and matched on the start of it (case and punctuation ignored), `after` = that key.
 * `page` > 1 without `after` skips pages with an offset, which Firestore bills for: prefer `after`.
 */
export async function listProposals(db: Firestore, o: { status?: string; q?: string; page?: number; after?: string }) {
  const status = o.status ?? 'pending'
  if (!(PROPOSAL_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, 'Unknown status.', 'BR-LIB-010')
  const page = Math.max(1, Math.min(40, Math.floor(o.page ?? 1)))
  const prefix = o.q ? searchPrefix(o.q) : ''
  let q: Query = db.collection(PROPOSALS).where('status', '==', status)
  const sep = o.after ? o.after.indexOf('~') : -1
  if (prefix) {
    q = q.where('sortKey', '>=', prefix).where('sortKey', '<', prefix + '').orderBy('sortKey').orderBy(FieldPath.documentId())
    if (o.after && sep > 0) q = q.startAfter(o.after.slice(0, sep), o.after.slice(sep + 1))
  } else {
    q = q.orderBy('updatedAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
    if (o.after && sep > 0 && Number(o.after.slice(0, sep)) > 0) q = q.startAfter(Timestamp.fromMillis(Number(o.after.slice(0, sep))), o.after.slice(sep + 1))
  }
  if (!o.after && page > 1) q = q.offset((page - 1) * PAGE_SIZE)
  const snap = await q.limit(PAGE_SIZE).get()
  const items = snap.docs.map(propOut)
  const last = snap.docs[snap.docs.length - 1]
  return { items, page, next: snap.size === PAGE_SIZE && last ? (prefix ? `${last.get('sortKey')}~${last.id}` : `${ms(last.get('updatedAt'))}~${last.id}`) : null }
}

function cleanIds(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_IDS) throw new HttpError(400, `Send between 1 and ${MAX_IDS} ids.`, 'BR-LIB-010')
  const ids = v.map(x => (typeof x === 'string' || typeof x === 'number' ? String(x) : ''))
  if (ids.some(x => !x || x.length > 64 || x.includes('/'))) throw new HttpError(400, 'One of the ids is not valid.', 'BR-LIB-010')
  return [...new Set(ids)]
}

/** Moves proposals from one of `from` to `to`. Others are reported back, not changed. */
async function moveProposals(db: Firestore, idsRaw: unknown, from: ProposalStatus[], to: ProposalStatus, uid: string) {
  const ids = cleanIds(idsRaw)
  const refs = ids.map(i => db.collection(PROPOSALS).doc(i))
  const docs = await db.getAll(...refs)
  const batch = db.batch(), skipped: string[] = []
  let n = 0
  for (const d of docs) {
    if (!d.exists || !from.includes(d.get('status'))) { skipped.push(d.id); continue }
    batch.update(d.ref, { status: to, updatedAt: Timestamp.now(), [`${to}By`]: uid, error: FieldValue.delete() })
    n++
  }
  if (n) await batch.commit()
  return { changed: n, skipped }
}

export const approveProposals = (db: Firestore, ids: unknown, uid: string) => moveProposals(db, ids, ['pending', 'rejected', 'failed'], 'approved', uid)
export const rejectProposals = (db: Firestore, ids: unknown, uid: string) => moveProposals(db, ids, ['pending', 'approved', 'failed'], 'rejected', uid)

/** Approve every pending proposal at or above a confidence (0.5 to 1), up to 400 per call. `more` says to call again. */
export async function approveAbove(db: Firestore, minConfidence: unknown, uid: string) {
  const c = Number(minConfidence)
  if (!Number.isFinite(c) || c < 0.5 || c > 1) throw new HttpError(400, 'minConfidence must be between 0.5 and 1.', 'BR-LIB-010')
  const snap = await db.collection(PROPOSALS).where('status', '==', 'pending').where('proposed.confidence', '>=', c)
    .orderBy('proposed.confidence', 'desc').limit(MAX_IDS).get()
  const batch = db.batch()
  for (const d of snap.docs) batch.update(d.ref, { status: 'approved', updatedAt: Timestamp.now(), approvedBy: uid })
  if (snap.size) await batch.commit()
  return { changed: snap.size, more: snap.size === MAX_IDS }
}

/** Edit what a proposal would write. The proposal goes back to pending, so a change always needs a fresh approval. */
export async function editProposal(db: Firestore, idRaw: unknown, fieldsRaw: unknown, uid: string) {
  const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : ''
  if (!id || id.length > 64 || id.includes('/')) throw new HttpError(400, 'That id is not valid.', 'BR-LIB-010')
  const f = cleanProposalFields(fieldsRaw)
  if (!f.ok) throw new HttpError(400, f.why, 'BR-LIB-009')
  const ref = db.collection(PROPOSALS).doc(id)
  return db.runTransaction(async tx => {
    const d = await tx.get(ref)
    if (!d.exists || d.get('status') === 'applied') throw new HttpError(409, 'That proposal can not be changed.', 'BR-LIB-008')
    const patch: Record<string, unknown> = { status: 'pending', updatedAt: Timestamp.now(), editedBy: uid, 'proposed.source': 'manual', 'proposed.confidence': 1 }
    for (const [k, v] of Object.entries(f.fields)) patch[`proposed.${k}`] = v
    tx.update(ref, patch)
    return { ok: true }
  })
}

// ── status ──
export async function workerState(db: Firestore, now = Date.now()) {
  const d = await db.collection('workerStatus').doc('pc').get()
  const lastSeen = ms(d.get('lastSeen'))
  return {
    online: lastSeen > 0 && now - lastSeen < ONLINE_MS, lastSeen: lastSeen || null, version: d.get('version') ?? null,
    currentJobId: d.get('currentJobId') ?? null, liveNow: d.get('liveNow') === true,
  }
}

// ── change log ──
export interface ChangeIn { songId: unknown; field: unknown; old?: unknown; new?: unknown; undoOf?: unknown; artist?: unknown; title?: unknown }

/**
 * The PC reports what it changed in AzuraCast. Each report is checked (job running, right kind of job, an approved proposal, or an undo of a
 * real change) and written to libraryChanges. Beat changes also update the stored beats. Append only: nothing here edits or deletes a record.
 */
export async function recordChanges(db: Firestore, jobId: string, list: unknown) {
  if (!Array.isArray(list) || !list.length || list.length > 200) throw new HttpError(400, 'Send between 1 and 200 changes.', 'BR-LIB-010')
  const job = await db.collection(JOBS).doc(jobId).get()
  if (!job.exists) throw new HttpError(404, 'That job does not exist.', 'BR-LIB-006')
  const items = list as ChangeIn[]
  const songIds = items.map(c => (typeof c.songId === 'string' || typeof c.songId === 'number' ? String(c.songId) : ''))
  if (songIds.some(s => !s || s.length > 64 || s.includes('/'))) throw new HttpError(400, 'A songId is not valid.', 'BR-LIB-010')
  const isUndo = job.get('type') === 'library.undo'
  const propDocs = job.get('type') === 'library.apply' ? await db.getAll(...[...new Set(songIds)].map(s => db.collection(PROPOSALS).doc(s))) : []
  const status = new Map(propDocs.map(d => [d.id, d.exists ? String(d.get('status')) : undefined]))
  const originals = isUndo ? await db.getAll(...items.map(c => db.collection(CHANGES).doc(String(c.undoOf || '_none')))) : []
  const batch = db.batch(), beats: { key: string; value: [number, number] | null }[] = []
  items.forEach((c, i) => {
    const why = changeRefusal({ type: job.get('type'), status: job.get('status') }, c, status.get(songIds[i]))
    if (why) throw new HttpError(409, why, 'BR-LIB-011')
    if (isUndo && (!originals[i].exists || originals[i].get('songId') !== songIds[i] || originals[i].get('field') !== c.field)) throw new HttpError(409, 'That change does not exist.', 'BR-LIB-011')
    const field = c.field as ChangeField
    const ref = isUndo ? db.collection(CHANGES).doc(undoRecordId(String(c.undoOf))) : db.collection(CHANGES).doc()
    batch.create(ref, {
      songId: songIds[i], field, old: c.old ?? null, new: c.new ?? null, by: WORKER_UID, at: Timestamp.now(), jobId,
      ...(isUndo ? { undoOf: String(c.undoOf) } : {}),
      ...(typeof c.artist === 'string' ? { artist: c.artist.slice(0, 200) } : {}), ...(typeof c.title === 'string' ? { title: c.title.slice(0, 200) } : {}),
    })
    if (field === 'beat') {
      const v = c.new as { bpm?: number; firstBeat?: number } | null
      beats.push({ key: beatKey(String(c.artist), String(c.title)), value: v && typeof v.bpm === 'number' ? [v.bpm, Math.max(0, Number(v.firstBeat) || 0)] : null })
    }
  })
  try { await batch.commit() } catch (e) {
    if ((e as { code?: number }).code === 6) throw new HttpError(409, 'One of those changes was already undone.', 'BR-LIB-011')
    throw e
  }
  if (beats.length) await writeBeats(db, beats)
  return { recorded: items.length }
}

/** Change records, newest first, 100 per page. `after` = the `at` (ms) of the last record on the previous page. */
export async function listChanges(db: Firestore, o: { jobId?: string; after?: number }) {
  let q: Query = db.collection(CHANGES)
  if (o.jobId) q = q.where('jobId', '==', o.jobId)
  q = q.orderBy('at', 'desc')
  if (o.after) q = q.startAfter(Timestamp.fromMillis(o.after))
  const snap = await q.limit(100).get()
  const items = snap.docs.map(d => ({
    id: d.id, songId: d.get('songId'), field: d.get('field'), old: d.get('old') ?? null, new: d.get('new') ?? null, by: d.get('by'), at: ms(d.get('at')),
    jobId: d.get('jobId'), undoOf: d.get('undoOf') ?? null, artist: d.get('artist') ?? null, title: d.get('title') ?? null,
  }))
  return { items, next: items.length === 100 ? items[items.length - 1].at : null }
}
