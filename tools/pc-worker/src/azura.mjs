import { log } from './log.mjs'

// The worker's own AzuraCast reads (only the hourly "is there new media?" check). Same pace as the tools: about one call
// a second, backing off on 429 and 5xx.

export function makeAzura(cfg) {
  let last = 0
  async function get(path) {
    let wait = 2000
    for (let i = 1; i <= 6; i++) {
      const gap = cfg.azura.minInterval * 1000 - (Date.now() - last)
      if (gap > 0) await new Promise(r => setTimeout(r, gap))
      last = Date.now()
      let res
      try {
        res = await fetch(`${cfg.azura.url}/api/station/${encodeURIComponent(cfg.azura.station)}/${path}`, { headers: { 'X-API-Key': cfg.azura.apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(120_000) })
      } catch (e) {
        if (i === 6) throw e
        await new Promise(r => setTimeout(r, wait)); wait = Math.min(60_000, wait * 2); continue
      }
      if (res.ok) return res.json()
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'))
        await new Promise(r => setTimeout(r, ra > 0 ? Math.min(60, ra) * 1000 : wait)); wait = Math.min(60_000, wait * 2); continue
      }
      throw new Error(`AzuraCast ${res.status}`)
    }
    throw new Error('AzuraCast kept failing')
  }

  /** {count, maxId} of the station's media (pages of 500). */
  async function libraryShape() {
    let count = 0, maxId = 0
    for (let page = 1; page <= 200; page++) {
      const data = await get(`files?page=${page}&per_page=500`)
      const rows = Array.isArray(data) ? data : data.rows || data.data || []
      count += rows.length
      for (const m of rows) maxId = Math.max(maxId, Number(m.id) || 0)
      if (Array.isArray(data) || rows.length < 500) break
    }
    log.debug(`library has ${count} files, newest id ${maxId}`)
    return { count, maxId }
  }
  return { libraryShape }
}
