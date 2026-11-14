// "Update available" on the booth. Every few minutes the helper asks GitHub (git fetch with the PC's read-only deploy key; no website
// calls, nothing on Vercel) whether main has commits for tools/studio-helper that this PC doesn't have. /ping reports the count, and the
// booth's Update button calls /update, which runs scripts/update-helper.cmd: git pull, npm ci if the lock file changed, restart node.
// The update never runs while a show is live or being recorded.

export const CHECK_MS = 10 * 60_000

/**
 * deps: {
 *   git(args) -> Promise<string stdout>, now() -> ms, busy() -> Promise<string|''> (why it can't update now, '' when free),
 *   runUpdate() -> void (starts update-helper.cmd detached; it stops this process), log?
 * }
 */
export function createUpdates(deps) {
  const log = deps.log || (() => {})
  const st = { behind: 0, checkedAt: 0, error: '', updating: false, updatingAt: 0 }
  let checking = null

  async function check() {
    if (checking) return checking
    checking = (async () => {
      try {
        await deps.git(['fetch', '-q', 'origin', 'main'])
        const n = Number(String(await deps.git(['rev-list', '--count', 'HEAD..origin/main', '--', 'tools/studio-helper'])).trim())
        st.behind = Number.isFinite(n) ? n : 0
        st.error = ''
      } catch (e) {
        st.error = String(e?.message || e).slice(0, 200)
      } finally {
        st.checkedAt = deps.now()
        checking = null
      }
      return state()
    })()
    return checking
  }

  // If the update script didn't restart the helper (nothing to pull, or it failed), the button comes back after 5 minutes.
  function state() {
    if (st.updating && deps.now() - st.updatingAt > 5 * 60_000) st.updating = false
    return { behind: st.behind, checkedAt: st.checkedAt, error: st.error, updating: st.updating }
  }

  /** Returns { ok } or { error }. Only when GitHub has something newer, and never mid-show. */
  async function update() {
    if (state().updating) return { ok: true, already: true }
    await check()
    if (!st.behind) return { ok: true, nothing: true }
    const why = await deps.busy()
    if (why) return { error: why }
    st.updating = true
    st.updatingAt = deps.now()
    log(`UPDATE      ${st.behind} new helper change(s) from GitHub, updating and restarting`)
    deps.runUpdate()
    return { ok: true }
  }

  return { check, state, update }
}
