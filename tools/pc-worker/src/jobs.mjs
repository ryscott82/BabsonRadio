import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { log } from './log.mjs'
import { APPLY_KINDS, planApply, planUndo } from './rules.mjs'
import { runTool } from './python.mjs'

// One runner per job type. Proposal jobs only read AzuraCast and write pending proposals. library.apply and library.undo are
// the only ones that change AzuraCast, and only when ALLOW_APPLY=1 (otherwise they are dry runs). Every change is recorded in
// libraryChanges (POST /api/worker/changes) BEFORE the tool is told to make it.

const STOP_AFTER = 20

export function stateFiles(cfg, jobId) {
  const dir = join(cfg.stateDir, 'jobs')
  mkdirSync(dir, { recursive: true })
  const f = name => join(dir, `${jobId}.${name}.json`)
  return {
    resume: kind => f(`done-${kind}`),
    write: (name, value) => { const p = f(name); writeFileSync(p, JSON.stringify(value)); return p },
  }
}

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return d } }
const limitArgs = cfg => (cfg.jobLimit ? ['--limit', String(cfg.jobLimit)] : [])

/** Runs a tool and turns its exit into success or a thrown error with a useful message. */
async function tool(ctx, script, args, handlers) {
  // Keep the one-call-a-second pace across tools too (each tool paces itself).
  await new Promise(r => setTimeout(r, ctx.cfg.azura.minInterval * 1000))
  const r = await runTool(ctx.cfg, script, args, {
    next: () => ctx.gate(),
    change: () => 'skip',
    progress: m => ctx.progress(m.done, m.total, m.note),
    ...handlers,
  }, ctx.ctl)
  if (ctx.cancelled) throw Object.assign(new Error('Cancelled.'), { cancelled: true })
  if (r.code === 3) throw new Error(`Stopped after ${STOP_AFTER} failures in a row. Last: ${r.errors.at(-1)?.msg ?? r.tail.at(-1) ?? ''}`)
  if (r.code !== 0) throw new Error(`${script} exited with ${r.code}: ${r.tail.slice(-3).join(' | ').slice(0, 300) || 'no output'}`)
  return r
}

/** Proposal jobs: the tool prints results, the worker files them as pending proposals. */
async function proposeJob(ctx, script, args, write) {
  let found = 0, kept = 0
  const r = await tool(ctx, script, [...args, '--json', '--resume', ctx.files.resume(script), ...limitArgs(ctx.cfg)], {
    result: async m => { const how = await write(m); if (how === 'kept') kept++; else if (how !== 'skipped') found++ },
  })
  const s = r.summary || {}
  return `${found} proposals${kept ? `, ${kept} left alone (already approved or rejected)` : ''}, ${s.failed ?? 0} failed`
}

function idsArgs(ctx, p) {
  return p.songIds ? ['--ids', ctx.files.write('ids', p.songIds)] : []
}

// ── apply and undo ──
/** Answers a tool's "change" question: records the change first; only then says go. */
function changeRecorder(ctx, extraFor) {
  let inRow = 0
  return async m => {
    if (ctx.cancelled) return 'stop'
    const changes = (m.changes || []).map(c => ({ songId: String(m.id), field: c.field, old: c.old ?? null, new: c.new ?? null, ...(c.undoOf ? { undoOf: c.undoOf } : {}), ...(extraFor?.(m.id, c) || {}) }))
    try {
      await ctx.site.recordChanges(ctx.job.id, changes)
      inRow = 0
      ctx.recorded += changes.length
      return 'go'
    } catch (e) {
      // Undo records for an earlier undo job aren't listed under this job id; the site refuses a second undo of the same
      // change, which just means it is already back.
      if (e.status === 409 && /already undone/i.test(e.message)) { ctx.alreadyUndone = (ctx.alreadyUndone || 0) + 1; return 'skip' }
      inRow++
      ctx.failedIds.add(String(m.id))
      log.warn(`Could not record change for song ${m.id}: ${e.message}`)
      return inRow >= STOP_AFTER ? 'stop' : 'skip'
    }
  }
}

async function runPlan(ctx, kind, script, plan) {
  if (!plan.length) return
  const args = ['--json', '--plan', ctx.files.write(`plan-${kind}`, plan), '--resume', ctx.files.resume(`${kind}`), ...(ctx.cfg.allowApply ? ['--apply'] : [])]
  await tool(ctx, script, args, {
    change: changeRecorder(ctx),
    would: m => { ctx.would += (m.changes || []).length },
    error: m => { ctx.failedIds.add(String(m.id)) },
  })
}

/** Beats live in the site's database, not AzuraCast: recording the change IS the change. */
async function runBeats(ctx, steps) {
  const record = changeRecorder(ctx, (_id, c) => ({ artist: c.artist, title: c.title }))
  for (const [i, s] of steps.entries()) {
    if ((await ctx.gate()) === 'stop') break
    if (!ctx.cfg.allowApply) { ctx.would++; continue }
    const a = await record({ id: s.songId, changes: [{ field: 'beat', old: s.old ?? null, new: s.new, artist: s.artist, title: s.title, ...(s.undoOf ? { undoOf: s.undoOf } : {}) }] })
    if (a === 'stop') break
    await ctx.progress(i + 1, steps.length, 'beats')
  }
}

async function applyJob(ctx, p) {
  const kinds = p.kinds || APPLY_KINDS
  let props = []
  if (p.proposalIds) {
    for (const id of p.proposalIds) { const d = await getDoc(doc(ctx.db, 'workerProposals', id)); if (d.exists()) props.push({ ...d.data(), songId: d.id }) }
  } else {
    props = (await getDocs(query(collection(ctx.db, 'workerProposals'), where('status', '==', 'approved'), limit(500)))).docs.map(d => ({ ...d.data(), songId: d.id }))
  }
  props = props.filter(x => x.status === 'approved')
  if (ctx.cfg.jobLimit) props = props.slice(0, ctx.cfg.jobLimit)
  const actions = planApply(props, kinds)
  const by = k => actions.filter(a => a.kind === k)
  await ctx.progress(0, props.length, `${props.length} approved proposals, ${actions.length} changes${ctx.cfg.allowApply ? '' : ' (dry run)'}`)

  await runPlan(ctx, 'metadata', 'apply_metadata.py', by('metadata').map(a => ({ songId: a.songId, fields: a.changes.map(c => ({ field: c.field, new: c.new })) })))
  await runPlan(ctx, 'art', 'fetch_album_art.py', by('art').map(a => ({ songId: a.songId, artUrl: a.changes[0].new })))
  await runPlan(ctx, 'amplify', 'normalize_loudness.py', by('amplify').map(a => ({ songId: a.songId, amplify: a.changes[0].new })))
  await runBeats(ctx, by('beat').map(a => ({ songId: a.songId, new: a.changes[0].new, artist: a.artist, title: a.title })))

  if (!ctx.cfg.allowApply) return `Dry run: ${ctx.would} changes would be made to ${props.length} songs. Set ALLOW_APPLY=1 on the PC to apply.`
  // Mark each proposal: applied if all its changes went through, failed otherwise.
  let applied = 0, failed = 0
  for (const x of props) {
    const bad = ctx.failedIds.has(x.songId)
    try {
      await updateDoc(doc(ctx.db, 'workerProposals', x.songId), { status: bad ? 'failed' : 'applied', updatedAt: serverTimestamp(), error: bad ? 'Some changes failed. See the PC log.' : null })
      bad ? failed++ : applied++
    } catch (e) { log.warn(`Could not mark proposal ${x.songId}: ${e.message}`) }
  }
  return `${ctx.recorded} changes made. ${applied} proposals applied, ${failed} failed.`
}

async function undoJob(ctx, p) {
  const all = []
  let after
  for (let page = 0; page < 50; page++) {
    const r = await ctx.site.listChanges(p.jobId, after)
    all.push(...r.items)
    if (!r.next || (p.changeIds && p.changeIds.every(id => all.some(c => c.id === id)))) break
    after = r.next
  }
  let steps = planUndo(all, { jobId: p.jobId, changeIds: p.changeIds })
  if (ctx.cfg.jobLimit) {   // the limit counts songs, so each chosen song is put back completely
    const songs = [...new Set(steps.map(s => s.songId))].slice(0, ctx.cfg.jobLimit)
    steps = steps.filter(s => songs.includes(s.songId))
  }
  await ctx.progress(0, steps.length, `${steps.length} changes to undo${ctx.cfg.allowApply ? '' : ' (dry run)'}`)
  const meta = steps.filter(s => ['title', 'artist', 'album'].includes(s.field))
  // One plan item per change, newest first, so several changes to one field unwind in order.
  await runPlan(ctx, 'undo-metadata', 'apply_metadata.py', meta.map(s => ({ songId: s.songId, fields: [{ field: s.field, new: typeof s.restore === 'string' ? s.restore : '', undoOf: s.changeId }] })))
  await runPlan(ctx, 'undo-art', 'fetch_album_art.py', steps.filter(s => s.field === 'art').map(s => ({ songId: s.songId, restore: typeof s.restore === 'string' && s.restore.startsWith('backup:') ? s.restore : null, undoOf: s.changeId })))
  await runPlan(ctx, 'undo-amplify', 'normalize_loudness.py', steps.filter(s => s.field === 'amplify').map(s => ({ songId: s.songId, amplify: typeof s.restore === 'number' ? s.restore : null, undoOf: s.changeId })))
  await runBeats(ctx, steps.filter(s => s.field === 'beat').map(s => ({ songId: s.songId, old: null, new: s.restore ?? null, artist: s.artist, title: s.title, undoOf: s.changeId })))
  const already = ctx.alreadyUndone ? `, ${ctx.alreadyUndone} were already undone` : ''
  return ctx.cfg.allowApply ? `${ctx.recorded} changes undone${already}, ${ctx.failedIds.size} songs failed.` : `Dry run: ${ctx.would} changes would be undone.`
}

// ── the table of job types (the allowlist) ──
export const RUNNERS = {
  'schedule.reconcile': async ctx => { await ctx.site.reconcile(); return 'Schedule checked.' },

  'library.scan': async ctx => {
    const out = join(ctx.cfg.stateDir, 'library.json')
    const r = await tool(ctx, 'azuracast_export.py', ['--json', '--out', out, ...limitArgs(ctx.cfg)], {})
    const s = r.summary || {}
    writeFileSync(join(ctx.cfg.stateDir, 'scan.json'), JSON.stringify({ count: s.count ?? 0, maxId: s.maxId ?? 0, at: Date.now() }))
    return `${s.count ?? 0} songs; ${s.missingArt ?? 0} without art; ${s.missingTags ?? 0} missing artist or title.`
  },

  'library.fetch_metadata': (ctx, p) => proposeJob(ctx, 'apply_metadata.py', ['--propose', ...(p.onlyMissing ? ['--only-missing'] : []), ...idsArgs(ctx, p)], m => ctx.proposals.metadata(m)),

  'library.fetch_art': (ctx, p) => proposeJob(ctx, 'fetch_album_art.py', ['--find', ...(p.onlyMissing ? ['--only-missing'] : []), ...idsArgs(ctx, p)], m => ctx.proposals.art(m)),

  'library.analyze_beats': (ctx, p) => {
    const knownFile = join(ctx.cfg.stateDir, 'beats_known.json')
    const known = readJson(knownFile, [])
    const skip = !p.force && known.length ? ['--skip', ctx.files.write('skip', known)] : []
    return proposeJob(ctx, 'analyze_beats.py', [...skip, ...(p.force ? ['--redo'] : []), ...idsArgs(ctx, p)], async m => {
      const how = await ctx.proposals.beat(m)
      const key = `${String(m.current?.artist ?? '')}|${String(m.current?.title ?? '')}`
      known.push(key.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9|]+/g, ''))
      writeFileSync(knownFile, JSON.stringify([...new Set(known)]))
      return how
    })
  },

  'library.measure_loudness': (ctx, p) => proposeJob(ctx, 'normalize_loudness.py', ['--measure', '--target', String(p.targetLufs ?? ctx.cfg.targetLufs), ...idsArgs(ctx, p)], m => ctx.proposals.loudness(m)),

  'library.apply': applyJob,
  'library.undo': undoJob,
}

export const touchesLibrary = type => type !== 'schedule.reconcile'
