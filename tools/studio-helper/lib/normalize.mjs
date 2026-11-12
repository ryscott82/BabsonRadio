// Optional (NORMALIZE_RECORDINGS=1): even out a student recording's loudness after it is safely in AzuraCast, with the PC worker's own
// low-priority tool runner (tools/pc-worker/src/python.mjs) and tools/normalize_loudness.py: measure, then set AzuraCast's "Amplify" for
// that one file (the file itself is not changed). It asks before each step and answers "stop" if a show went live, so it never runs on air.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** deps: { runTool(cfg, script, args, handlers), cfg, isLive() -> Promise<boolean>, target? }. Returns 'done' | 'skipped' | 'later'. */
export async function normalizeOne(mediaId, deps) {
  if (await deps.isLive().catch(() => true)) return 'later'
  const dir = mkdtempSync(join(tmpdir(), 'br-loud-'))
  let stopped = false
  const gate = async () => { if (await deps.isLive().catch(() => true)) { stopped = true; return 'stop' } return 'go' }
  try {
    const ids = join(dir, 'ids.json')
    writeFileSync(ids, JSON.stringify([String(mediaId)]))
    let gain = null
    const target = deps.target ? ['--target', String(deps.target)] : []
    const m = await deps.runTool(deps.cfg, 'normalize_loudness.py', ['--json', '--measure', '--ids', ids, ...target], {
      next: gate, change: async () => 'skip', result: async r => { if (String(r.id) === String(mediaId)) gain = r.loudness?.gainDb ?? null },
    })
    if (stopped) return 'later'
    if (m.code !== 0) throw new Error(`measuring failed (exit ${m.code}): ${m.tail.slice(-2).join(' ')}`)
    if (gain === null || !Number.isFinite(gain)) return 'skipped'
    const plan = join(dir, 'plan.json')
    writeFileSync(plan, JSON.stringify([{ songId: String(mediaId), amplify: gain }]))
    const a = await deps.runTool(deps.cfg, 'normalize_loudness.py', ['--json', '--plan', plan, '--apply'], { next: gate, change: gate })
    if (stopped) return 'later'
    if (a.code !== 0) throw new Error(`setting the gain failed (exit ${a.code}): ${a.tail.slice(-2).join(' ')}`)
    return 'done'
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
