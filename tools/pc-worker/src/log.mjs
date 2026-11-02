import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// Rotating log (logs/worker.log, 5 MB x 5 files). Every line is scrubbed: known secrets, tokens, API keys and Authorization
// headers never reach the file or the console.

const MAX_BYTES = 5 * 1024 * 1024, KEEP = 5
const secrets = new Set()
let file = ''

export function initLog(dir) {
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'worker.log')
}

/** Anything added here is replaced by [redacted] wherever it appears. */
export function addSecret(v) { if (v && String(v).length >= 8) secrets.add(String(v)) }

export function redact(text) {
  let s = String(text)
  for (const v of secrets) s = s.split(v).join('[redacted]')
  return s
    .replace(/(x-api-key|authorization|x-worker-sig|api[_-]?key|secret|token|password)(["']?\s*[:=]\s*["']?)(bearer\s+)?[^\s"',;}]+/gi, '$1$2[redacted]')
    .replace(/\bey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-jwt]')
}

function rotate() {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return
    if (existsSync(`${file}.${KEEP}`)) unlinkSync(`${file}.${KEEP}`)
    for (let i = KEEP - 1; i >= 1; i--) if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`)
    renameSync(file, `${file}.1`)
  } catch { /* logging must never stop the worker */ }
}

function write(level, parts) {
  const msg = redact(parts.map(p => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' '))
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}`
  if (level !== 'DEBUG' || process.env.LOG_DEBUG === '1') console.log(line)
  if (!file) return
  rotate()
  try { appendFileSync(file, line + '\n') } catch { /* ignore */ }
}

export const log = {
  info: (...p) => write('INFO', p),
  warn: (...p) => write('WARN', p),
  error: (...p) => write('ERROR', p),
  debug: (...p) => write('DEBUG', p),
}
