import { log } from './log.mjs'

// Is a show on air? Two sources: the studio helper (BUTT connected, checked on this PC, free) and the site's now-playing feed
// (any live DJ, cached for a minute so the site isn't asked between every song). Unknown counts as not live.

const SITE_CACHE_MS = 60_000, WAIT_MS = Number(process.env.LIVE_RECHECK_MS) || 60_000

export function makeLive(cfg, site) {
  let siteAt = 0, siteLive = false
  async function helperLive() {
    try {
      const r = await fetch(`${cfg.helperUrl}/status`, { headers: { origin: cfg.helperOrigin }, signal: AbortSignal.timeout(5_000) })
      if (!r.ok) return null
      const s = await r.json()
      return s.connected === true || s.connecting === true
    } catch { return null }
  }
  async function fromSite() {
    if (Date.now() - siteAt < SITE_CACHE_MS) return siteLive
    try { siteLive = (await site.nowPlaying()).isLive === true } catch (e) { log.debug(`nowplaying: ${e.message}`) }
    siteAt = Date.now()
    return siteLive
  }
  const isLive = async () => (await helperLive()) === true || (await fromSite())

  /** Waits (checking once a minute) until no show is live. onPause(true/false) tells the caller. Stops early if shouldStop(). */
  async function waitForNoShow({ onPause, shouldStop }) {
    if (!(await isLive())) return
    log.info('A live show is on air. Pausing until it ends.')
    await onPause?.(true)
    while (!shouldStop?.()) {
      await new Promise(r => setTimeout(r, WAIT_MS))
      siteAt = 0
      if (!(await isLive())) break
    }
    log.info('The live show ended. Carrying on.')
    await onPause?.(false)
  }
  return { isLive, waitForNoShow }
}
