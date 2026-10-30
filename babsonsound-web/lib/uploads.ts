// Rules for uploading music from the admin panel (pure, so they can be tested). The server applies them in lib/server/uploads.ts.
//
// Why there are limits: the site is on Vercel's free plan, which pauses the whole site when its monthly allowance runs out.
// Every 3 MB piece of an upload is one server call and passes through the site once, so uploads are counted, capped per day and per
// month, and stop by themselves when the site as a whole is close to its server-time limit.

/** Size of each piece the browser sends. Vercel refuses requests bigger than 4.5 MB, so this stays well under. */
export const CHUNK_BYTES = 3 * 1024 * 1024

export interface UploadLimits {
  enabled: boolean
  monthlyMB: number   // data through the site per month
  dailyMB: number     // data through the site per day
  monthlyCalls: number // server calls (one per piece) per month
  maxFileMB: number   // one song
  pauseAtCpuPct: number // stop uploads when the site has used this much of its server-time allowance
}
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = { enabled: true, monthlyMB: 3000, dailyMB: 600, monthlyCalls: 3000, maxFileMB: 60, pauseAtCpuPct: 80 }

export interface UploadUsage {
  month: string
  bytes: number
  calls: number
  files: number
  /** Today's totals (the server fills this from the per-day table). */
  todayBytes: number
}
export const EMPTY_USAGE = (month: string): UploadUsage => ({ month, bytes: 0, calls: 0, files: 0, todayBytes: 0 })

export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7)
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const MB = 1024 * 1024
export const chunkCount = (size: number) => Math.max(1, Math.ceil(size / CHUNK_BYTES))

export type Verdict = { ok: true; warn?: string } | { ok: false; reason: string }

/** May this piece go through? `cpuPct` is how much of the site's server-time allowance is used (0 to 100+). */
export function judgeChunk(usage: UploadUsage, limits: UploadLimits, chunkBytes: number, fileBytes: number, cpuPct: number): Verdict {
  if (!limits.enabled) return { ok: false, reason: 'Uploads are switched off. An admin can turn them on under Upload limits.' }
  if (fileBytes > limits.maxFileMB * MB) return { ok: false, reason: `That file is bigger than the ${limits.maxFileMB} MB limit for one song.` }
  if (cpuPct >= limits.pauseAtCpuPct) return { ok: false, reason: `Uploads are paused because the site has used ${Math.round(cpuPct)}% of its monthly server time. They come back next month or when the limit is raised.` }
  if (usage.calls + 1 > limits.monthlyCalls) return { ok: false, reason: 'The monthly upload call limit is used up. It resets next month, or an admin can raise it.' }
  if (usage.bytes + chunkBytes > limits.monthlyMB * MB) return { ok: false, reason: 'The monthly upload data limit is used up. It resets next month, or an admin can raise it.' }
  if (usage.todayBytes + chunkBytes > limits.dailyMB * MB) return { ok: false, reason: 'The daily upload data limit is used up. Try again tomorrow, or an admin can raise it.' }
  const pct = Math.max(((usage.bytes + chunkBytes) / (limits.monthlyMB * MB)) * 100, ((usage.calls + 1) / limits.monthlyCalls) * 100)
  return pct >= 80 ? { ok: true, warn: `This month's upload allowance is ${Math.round(pct)}% used.` } : { ok: true }
}

/** Returns a problem to show, or null when the file may be uploaded. */
export function fileProblem(name: string, size: number, limits: UploadLimits): string | null {
  if (!/\.mp3$/i.test(name)) return `${name}: only .mp3 files can be uploaded.`
  if (size <= 0) return `${name}: the file is empty.`
  if (size > limits.maxFileMB * MB) return `${name}: bigger than the ${limits.maxFileMB} MB limit.`
  return null
}

/** A plain file name: letters, numbers, spaces and a few symbols, ending in .mp3. */
export function cleanFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[^\p{L}\p{N} ._()&'+,-]/gu, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  return base.slice(0, 120)
}

/** A folder inside the station's media: no leading slash, no "..", at most 4 levels. "" is the top. Returns null when it is not acceptable. */
export function cleanFolder(raw: string): string | null {
  const parts = raw.split(/[\\/]+/).map(p => p.trim()).filter(Boolean)
  if (parts.length > 4) return null
  for (const p of parts) if (p === '.' || p === '..' || p.length > 60 || !/^[\p{L}\p{N} ._()&'+,-]+$/u.test(p)) return null
  return parts.join('/')
}
