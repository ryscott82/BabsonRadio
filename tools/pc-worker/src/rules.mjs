// The same rules as babsonsound-web/lib/worker.ts (job types, params, which proposals may be applied, how to undo).
// The PC checks everything again itself: it never trusts a job just because it is in the queue.

export const JOB_TYPES = [
  'library.scan', 'library.fetch_metadata', 'library.fetch_art', 'library.analyze_beats', 'library.measure_loudness',
  'library.apply', 'library.undo', 'schedule.reconcile',
]
export const APPLY_KINDS = ['metadata', 'art', 'amplify', 'beat']
export const CHANGE_FIELDS = ['title', 'artist', 'album', 'art', 'amplify', 'beat']
export const isJobType = t => typeof t === 'string' && JOB_TYPES.includes(t)

const ID = /^[A-Za-z0-9_-]{1,64}$/
const id = v => ((typeof v === 'string' || typeof v === 'number') && ID.test(String(v)) ? String(v) : null)
const idList = (v, max) => {
  if (!Array.isArray(v) || v.length > max) return null
  const out = v.map(id)
  return out.every(x => x !== null) ? out : null
}

const ALLOWED = {
  'library.scan': ['full'], 'library.fetch_metadata': ['songIds', 'onlyMissing'], 'library.fetch_art': ['songIds', 'onlyMissing'],
  'library.analyze_beats': ['songIds', 'force'], 'library.measure_loudness': ['songIds', 'targetLufs'],
  'library.apply': ['proposalIds', 'kinds'], 'library.undo': ['jobId', 'changeIds'], 'schedule.reconcile': [],
}

/** {ok:true, params} or {ok:false, why}. Unknown keys are refused. Song ids must be letters, digits, - or _. */
export function cleanJobParams(type, raw) {
  if (!isJobType(type)) return { ok: false, why: 'Job type is not allowed.' }
  const p = raw === undefined || raw === null ? {} : raw
  if (typeof p !== 'object' || Array.isArray(p)) return { ok: false, why: 'params must be an object.' }
  const extra = Object.keys(p).filter(k => !ALLOWED[type].includes(k))
  if (extra.length) return { ok: false, why: `Unknown params for ${type}: ${extra.join(', ')}.` }
  const out = {}
  const bool = k => { if (p[k] === undefined) return true; if (typeof p[k] !== 'boolean') return false; out[k] = p[k]; return true }
  const ids = (k, max) => { if (p[k] === undefined) return true; const l = idList(p[k], max); if (!l) return false; out[k] = l; return true }
  switch (type) {
    case 'library.scan': if (!bool('full')) return { ok: false, why: 'full must be true or false.' }; break
    case 'library.fetch_metadata': case 'library.fetch_art':
      if (!ids('songIds', 5000) || !bool('onlyMissing')) return { ok: false, why: 'songIds must be up to 5000 ids; onlyMissing true or false.' }; break
    case 'library.analyze_beats': if (!ids('songIds', 5000) || !bool('force')) return { ok: false, why: 'songIds must be up to 5000 ids; force true or false.' }; break
    case 'library.measure_loudness':
      if (!ids('songIds', 5000)) return { ok: false, why: 'songIds must be up to 5000 ids.' }
      if (p.targetLufs !== undefined) {
        const n = Number(p.targetLufs)
        if (typeof p.targetLufs !== 'number' || !Number.isFinite(n) || n < -30 || n > -5) return { ok: false, why: 'targetLufs must be between -30 and -5.' }
        out.targetLufs = n
      }
      break
    case 'library.apply':
      if (!ids('proposalIds', 500)) return { ok: false, why: 'proposalIds must be up to 500 ids.' }
      if (p.kinds !== undefined) {
        if (!Array.isArray(p.kinds) || !p.kinds.length || !p.kinds.every(k => APPLY_KINDS.includes(k))) return { ok: false, why: `kinds must be a list of: ${APPLY_KINDS.join(', ')}.` }
        out.kinds = [...new Set(p.kinds)]
      }
      break
    case 'library.undo':
      if (p.jobId !== undefined) { const j = id(p.jobId); if (!j) return { ok: false, why: 'jobId is not valid.' }; out.jobId = j }
      if (!ids('changeIds', 500)) return { ok: false, why: 'changeIds must be up to 500 ids.' }
      if (out.jobId === undefined && out.changeIds === undefined) return { ok: false, why: 'Say what to undo: a jobId or changeIds.' }
      break
    case 'schedule.reconcile': break
  }
  return { ok: true, params: out }
}

const norm = x => String(x ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
export const sortKeyOf = (artist, title) => `${norm(artist)}|${norm(title)}`

const isText = v => typeof v === 'string'

/** AzuraCast changes for APPROVED proposals only (same as planApply in lib/worker.ts). */
export function planApply(proposals, kinds = APPLY_KINDS) {
  const out = []
  for (const p of proposals) {
    if (!p || p.status !== 'approved' || !id(p.songId)) continue
    const cur = p.current || {}, prop = p.proposed || {}
    const meta = []
    for (const f of ['title', 'artist', 'album']) if (isText(prop[f]) && prop[f] !== '' && prop[f] !== (cur[f] ?? '')) meta.push({ field: f, new: prop[f] })
    if (kinds.includes('metadata') && meta.length) out.push({ songId: p.songId, kind: 'metadata', changes: meta })
    if (kinds.includes('art') && isText(prop.artUrl) && /^https:\/\/\S+$/.test(prop.artUrl)) out.push({ songId: p.songId, kind: 'art', changes: [{ field: 'art', new: prop.artUrl }] })
    const g = p.loudness?.gainDb
    if (kinds.includes('amplify') && typeof g === 'number' && Number.isFinite(g) && Math.abs(g) <= 24) out.push({ songId: p.songId, kind: 'amplify', changes: [{ field: 'amplify', new: Math.round(g * 10) / 10 }] })
    const b = p.beat
    if (kinds.includes('beat') && b && typeof b.bpm === 'number' && b.bpm >= 50 && b.bpm <= 220 && typeof b.firstBeat === 'number' && b.firstBeat >= 0) {
      // Beats are keyed by the artist and title the song will have on air.
      const tagsAfter = kinds.includes('metadata') ? { artist: isText(prop.artist) && prop.artist ? prop.artist : cur.artist, title: isText(prop.title) && prop.title ? prop.title : cur.title } : { artist: cur.artist, title: cur.title }
      out.push({ songId: p.songId, kind: 'beat', changes: [{ field: 'beat', new: { bpm: b.bpm, firstBeat: b.firstBeat } }], ...tagsAfter })
    }
  }
  return out
}

/** Undo steps, newest first, one per change; skips undo records and changes already undone (same as planUndo). */
export function planUndo(changes, pick) {
  const undone = new Set(changes.filter(c => c.undoOf).map(c => c.undoOf))
  const ids = pick.changeIds ? new Set(pick.changeIds) : null
  return changes
    .filter(c => !c.undoOf && !undone.has(c.id) && CHANGE_FIELDS.includes(c.field) && (pick.jobId ? c.jobId === pick.jobId : true) && (ids ? ids.has(c.id) : true))
    .sort((a, b) => b.at - a.at)
    .map(c => ({ changeId: c.id, songId: String(c.songId), field: c.field, restore: c.old, ...(c.artist ? { artist: c.artist } : {}), ...(c.title ? { title: c.title } : {}) }))
}
