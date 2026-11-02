import { createHmac, randomBytes } from 'node:crypto'
import { addSecret, log } from './log.mjs'

// babsonradio.com worker API. The secret never leaves the PC: requests carry a fresh nonce and its HMAC.

export class SiteError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code }
}

export function makeSite(cfg, getIdToken) {
  addSecret(cfg.workerSecret)
  const signed = () => {
    const nonce = `${Date.now()}.${randomBytes(12).toString('hex')}`
    return { 'x-worker-nonce': nonce, 'x-worker-sig': createHmac('sha256', cfg.workerSecret).update(`worker:${nonce}`).digest('hex') }
  }

  async function call(path, { method = 'POST', body, signedOnly = false, tries = 3 } = {}) {
    let wait = 2000
    for (let i = 1; ; i++) {
      let auth = {}
      if (!signedOnly) {
        const t = await getIdToken().catch(() => '')
        if (t) { addSecret(t); auth = { authorization: `Bearer ${t}` } }
      }
      const headers = { ...signed(), ...auth, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }
      let res
      try {
        res = await fetch(`${cfg.siteUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) })
      } catch (e) {
        if (i >= tries) throw new SiteError(0, `Can't reach ${cfg.siteUrl}: ${e.message}`)
        await new Promise(r => setTimeout(r, wait)); wait *= 2; continue
      }
      const data = await res.json().catch(() => ({}))
      if (res.ok) return data
      if ((res.status === 429 || res.status >= 500) && i < tries) { await new Promise(r => setTimeout(r, wait)); wait *= 2; continue }
      throw new SiteError(res.status, data.error || `HTTP ${res.status}`, data.code)
    }
  }

  return {
    /** A Firebase custom token for uid studio-worker (signed request only). */
    token: async () => { const r = await call('/api/worker/token', { signedOnly: true }); addSecret(r.token); return r },
    reconcile: () => call('/api/worker/reconcile'),
    enqueueScan: () => call('/api/worker/enqueue', { body: { type: 'library.scan' } }),
    /** Records changes in libraryChanges. Must succeed BEFORE the change is made in AzuraCast. */
    recordChanges: (jobId, changes) => call('/api/worker/changes', { body: { jobId, changes }, tries: 2 }),
    listChanges: (jobId, after) => call(`/api/worker/changes?${new URLSearchParams({ ...(jobId ? { jobId } : {}), ...(after ? { after: String(after) } : {}) })}`, { method: 'GET' }),
    nowPlaying: async () => {
      const r = await fetch(`${cfg.siteUrl}/api/nowplaying`, { signal: AbortSignal.timeout(15_000) })
      if (!r.ok) throw new SiteError(r.status, `nowplaying ${r.status}`)
      return r.json()
    },
    log,
  }
}
