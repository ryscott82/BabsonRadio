import { spawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { log } from './log.mjs'

// Runs one of the library tools in tools/ as a low-priority child process, in --json mode, and answers its questions:
//   {"t":"next"}   before each song   -> "go" (after waiting out any live show) or "stop" (job cancelled / shutting down)
//   {"t":"change"} before each change -> "go" only after the change is recorded in libraryChanges, else "skip" or "stop"
// Only these scripts can run, and arguments are built here from checked values; nothing from the database is executed.

export const SCRIPTS = new Set(['azuracast_export.py', 'apply_metadata.py', 'fetch_album_art.py', 'analyze_beats.py', 'normalize_loudness.py'])
const ARG = /^(--[a-z-]+|-?\d+(\.\d+)?|[A-Za-z0-9_.:\\/ -]{1,300})$/

export function childEnv(cfg) {
  const keep = ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'NUMBA_CACHE_DIR']
  const env = {}
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]
  return {
    ...env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8',
    AZURACAST_URL: cfg.azura.url, AZURACAST_STATION: cfg.azura.station, AZURACAST_API_KEY: cfg.azura.apiKey, AZ_MIN_INTERVAL: String(cfg.azura.minInterval),
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGTERM')
}

/**
 * handlers: next(msg) -> 'go'|'stop'; change(msg) -> 'go'|'skip'|'stop'; result(msg); progress(msg); error(msg); applied(msg)
 * Returns { code, summary, errors, tail } when the tool exits. `ctl.kill()` ends it at once.
 */
export function runTool(cfg, script, args, handlers, ctl = {}) {
  if (!SCRIPTS.has(script)) throw new Error(`Script not allowed: ${script}`)
  for (const a of args) if (typeof a !== 'string' || !ARG.test(a)) throw new Error(`Argument not allowed: ${String(a).slice(0, 40)}`)
  const pyArgs = cfg.python === 'py' ? ['-3', join(cfg.toolsDir, script), ...args] : [join(cfg.toolsDir, script), ...args]
  log.info(`run ${script} ${args.join(' ')}`)
  const child = spawn(cfg.python, pyArgs, { cwd: cfg.toolsDir, env: childEnv(cfg), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
  try { setPriority(child.pid, constants.priority.PRIORITY_LOW) } catch (e) { log.warn(`Could not lower priority: ${e.message}`) }
  ctl.kill = () => killTree(child)

  const tail = [], errors = []
  let summary = null, chain = Promise.resolve()
  const answer = a => { if (child.stdin.writable) child.stdin.write(`${a}\n`) }
  createInterface({ input: child.stderr }).on('line', l => { tail.push(l); if (tail.length > 30) tail.shift(); log.debug(`[${script}] ${l}`) })
  createInterface({ input: child.stdout }).on('line', line => {
    let m
    try { m = JSON.parse(line) } catch { log.debug(`[${script}] ${line}`); return }
    // One message at a time, in order: the tool waits for each answer anyway.
    chain = chain.then(async () => {
      try {
        switch (m.t) {
          case 'next': answer(await handlers.next(m)); break
          case 'change': answer(await handlers.change(m)); break
          case 'result': await handlers.result?.(m); break
          case 'progress': await handlers.progress?.(m); break
          case 'applied': await handlers.applied?.(m); break
          case 'would': await handlers.would?.(m); break
          case 'error': errors.push(m); log.warn(`[${script}] song ${m.id}: ${m.msg}`); await handlers.error?.(m); break
          case 'abort': log.warn(`[${script}] ${m.msg}`); break
          case 'log': log.info(`[${script}] ${m.msg}`); break
          case 'done': summary = m; break
        }
      } catch (e) {
        log.error(`Handler for ${m.t} failed: ${e.message}`)
        if (m.t === 'next' || m.t === 'change') answer('stop')
      }
    })
  })
  return new Promise(resolve => {
    child.on('error', e => { tail.push(e.message); resolve({ code: -1, summary, errors, tail }) })
    child.on('close', async code => { await chain; resolve({ code, summary, errors, tail }) })
  })
}
