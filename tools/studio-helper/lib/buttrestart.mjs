// Restart BUTT in the background after a show or a recording is saved (End show and Stop recording). On Nov 19 BUTT had to be restarted
// by hand before it would stream again, so the helper now does it once the recording file has been moved out of BUTT's folder.
//
// request() waits about 3 s, then: skips if BUTT is streaming, connecting or recording, or the helper's recorder is busy; otherwise asks
// BUTT to quit (butt -q), waits until it stops answering and its process is gone (force-closing butt.exe after 15 s), starts BUTT again
// and waits up to 30 s for it to answer on its command port. It never starts a second BUTT. Calls close together are one restart, and a
// restart within 20 s of the last one is skipped. Errors are logged, never thrown, so the HTTP response is never held up.
// beforeStart() is called by Go live and Record: during the 3 s wait it cancels the restart (the show matters more); once BUTT has been
// told to quit it waits until BUTT answers again, so a stream or a recording is never started while BUTT is closed.

/**
 * deps: {
 *   status() -> Promise<{ connected, connecting, recording }> (rejects when BUTT does not answer),
 *   quit() -> Promise (butt -q), forceKill() -> Promise (taskkill /im butt.exe /f), launch() -> void (start BUTT detached, no arguments),
 *   isRunning() -> Promise<boolean> (is a butt.exe process running), recorderActive() -> boolean,
 *   sleep(ms), now(), log?,
 *   delayMs?=3000, quitWaitMs?=15000, startWaitMs?=30000, cooldownMs?=20000, pollMs?=1100, killWaitMs?=5000
 * }
 */
export function createButtRestart(deps) {
  const o = { delayMs: 3000, quitWaitMs: 15_000, startWaitMs: 30_000, cooldownMs: 20_000, pollMs: 1100, killWaitMs: 5000, ...deps }
  const log = deps.log || (() => {})
  let pending = null // the restart in progress (or waiting its 3 s), shared by every call meanwhile
  let lastAt = -Infinity
  let closed = false // BUTT has been asked to quit and is not back yet
  let cancelled = false // a show or recording is starting: don't close BUTT

  const answers = () => o.status().then(s => s, () => null)
  const busy = s => !!s && (s.connected || s.connecting || s.recording)

  async function waitUntil(test, ms) {
    const end = o.now() + ms
    for (;;) {
      if (await test()) return true
      if (o.now() >= end) return false
      await o.sleep(o.pollMs)
    }
  }

  async function run() {
    await o.sleep(o.delayMs)
    if (cancelled) { log('BUTT RESTART skipped: a show or recording is starting'); return 'cancelled' }
    if (o.now() - lastAt < o.cooldownMs) { log('BUTT RESTART skipped: restarted less than 20 s ago'); return 'cooldown' }
    if (o.recorderActive()) { log('BUTT RESTART skipped: a recording is running'); return 'busy' }
    const st = await answers()
    if (busy(st)) { log('BUTT RESTART skipped: BUTT is streaming or recording'); return 'busy' }

    const running = await o.isRunning()
    if (cancelled) { log('BUTT RESTART skipped: a show or recording is starting'); return 'cancelled' }
    if (running) {
      closed = true
      if (st) await o.quit().catch(e => log('BUTT RESTART quit:', e.message))
      // Gone means: no longer answering, and no butt.exe left.
      let gone = await waitUntil(async () => !(await answers()) && !(await o.isRunning()), o.quitWaitMs)
      if (!gone) {
        log('BUTT RESTART: BUTT did not quit in 15 s, force-closing it')
        await o.forceKill().catch(e => log('BUTT RESTART taskkill:', e.message))
        gone = await waitUntil(async () => !(await o.isRunning()), o.killWaitMs)
      }
      if (!gone) { closed = false; log('BUTT RESTART failed: BUTT could not be closed, so a second one was not started'); return 'stuck' }
    } else {
      log('BUTT RESTART: BUTT was not running, starting it')
    }

    if (await o.isRunning()) { closed = false; log('BUTT RESTART: a BUTT is already running, not starting another'); return 'already' }
    o.launch()
    lastAt = o.now()
    const up = await waitUntil(async () => !!(await answers()), o.startWaitMs)
    closed = false
    if (!up) { log('BUTT RESTART: BUTT was started but is not answering on its command port after 30 s'); return 'no-answer' }
    log(running ? 'BUTT RESTART done' : 'BUTT RESTART done (it had not been running)')
    return running ? 'restarted' : 'started'
  }

  /** Queue a restart. Returns a promise of what happened (for tests and logs); never rejects. */
  function request() {
    if (pending) return pending
    cancelled = false
    pending = run().catch(e => { closed = false; log('BUTT RESTART ERROR', e?.message || e); return 'error' }).finally(() => { pending = null })
    return pending
  }

  return {
    request,
    /** Go live and Record call this first: cancels a restart that has not closed BUTT yet, or waits until BUTT is back. */
    beforeStart: () => {
      if (!pending) return Promise.resolve()
      if (!closed) { cancelled = true; return Promise.resolve() }
      return pending.then(() => undefined)
    },
    /** True while BUTT has been told to quit and is not answering again yet. */
    restarting: () => closed,
  }
}
