import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Settings come only from tools/pc-worker/.env (and the service's own environment). Nothing here is read from the database.

export const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function loadEnv(file = join(HERE, '.env')) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v))

export function readConfig(env = process.env) {
  const site = (env.SITE_URL || 'https://babsonradio.com').replace(/\/+$/, '')
  const c = {
    version: JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version,
    siteUrl: site,
    workerSecret: env.WORKER_SECRET || '',
    firebase: {
      apiKey: env.FIREBASE_API_KEY || '',
      authDomain: env.FIREBASE_AUTH_DOMAIN || '',
      projectId: env.FIREBASE_PROJECT_ID || '',
      appId: env.FIREBASE_APP_ID || '',
    },
    // Only for testing against the Firebase emulators (never set on the studio PC).
    emulators: { auth: env.FIREBASE_AUTH_EMULATOR_HOST || '', firestore: env.FIRESTORE_EMULATOR_HOST || '' },
    azura: {
      url: (env.AZURACAST_URL || 'https://a12.asurahosting.com').replace(/\/+$/, ''),
      station: env.AZURACAST_STATION || 'babson_radio',
      apiKey: env.AZURACAST_API_KEY || '',
      minInterval: num(env.AZ_MIN_INTERVAL, 1.0),
    },
    python: env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3'),
    toolsDir: resolve(env.TOOLS_DIR || join(HERE, '..')),
    stateDir: resolve(env.STATE_DIR || join(HERE, 'state')),
    logDir: resolve(env.LOG_DIR || join(HERE, 'logs')),
    helperUrl: (env.HELPER_URL || 'http://127.0.0.1:7781').replace(/\/+$/, ''),
    helperOrigin: env.HELPER_ORIGIN || site,
    /** 1 = library.apply and library.undo really change AzuraCast. Anything else = dry run (reports what it would do). */
    allowApply: env.ALLOW_APPLY === '1',
    /** > 0: every job handles at most this many songs (use 3 for the first end-to-end test). */
    jobLimit: Math.max(0, Math.floor(num(env.JOB_LIMIT, 0))),
    targetLufs: num(env.TARGET_LUFS, -14),
    heartbeatMs: 5 * 60_000,
    reconcileMs: 15 * 60_000,
    scanCheckMs: 60 * 60_000,
  }
  return c
}

export function configProblems(c) {
  const p = []
  if (c.workerSecret.length < 32) p.push('WORKER_SECRET must be set (32+ characters, same as in Vercel).')
  if (!/^https:\/\//.test(c.siteUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(c.siteUrl)) p.push('SITE_URL must be https.')
  for (const k of ['apiKey', 'projectId']) if (!c.firebase[k]) p.push(`FIREBASE_${k === 'apiKey' ? 'API_KEY' : 'PROJECT_ID'} must be set.`)
  if (!c.azura.apiKey) p.push('AZURACAST_API_KEY must be set (a key for a user that can only manage media).')
  if (!/^https?:\/\//.test(c.azura.url)) p.push('AZURACAST_URL must be a URL.')
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(c.azura.station)) p.push('AZURACAST_STATION must be the station short name or id.')
  return p
}
