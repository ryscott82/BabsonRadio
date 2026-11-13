// The studio browser: a normal Chrome window next to the booth, for show notes, YouTube, Google Docs or Notion.
// It uses its own Chrome profile (BabsonRadioBrowser), never the booth's and never a personal one. Sign-ins are kept between visits
// on purpose, so people can stay signed in; the window itself closes when the person signs out.
//
// Layouts:  split  the browser takes the right half; the booth shows only its left column.
//           full   the browser takes everything right of a narrow strip; the booth shows a slim rail (ON AIR, time, End show).
// The window is moved and kept on top by Windows calls (browser-window.ps1 here, and the booth watchdog, which reads browser.json
// and stops putting the booth on top while the browser is open).

export const LAYOUTS = ['split', 'full']
export const RAIL_PX = 260
/** Only web pages. Quick links and anything typed go through this. */
export function safeUrl(v) {
  try {
    const u = new URL(String(v || '').trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.slice(0, 2000) : ''
  } catch { return '' }
}

/**
 * deps: { chrome, profileDir, spawn(cmd, args) -> { pid }, place(pid, layout) -> Promise<pid|0> (finds and moves the window, returns the
 *         window's process id), kill(pid), alive(pid) -> bool, store: { load(), save(v|null) }, log? }
 */
export function createBrowser(deps) {
  const log = deps.log || (() => {})
  const get = () => { const s = deps.store.load(); return s && Number(s.pid) > 0 && LAYOUTS.includes(s.layout) ? s : null }

  function state() {
    const s = get()
    if (s && !deps.alive(s.pid)) { deps.store.save(null); return { open: false, layout: '', railPx: RAIL_PX } }
    return { open: !!s, layout: s?.layout ?? '', railPx: RAIL_PX, ...(s ? { since: s.since || s.at } : {}) }
  }

  async function open(url, layout = 'split') {
    const href = safeUrl(url)
    if (!href) throw new Error('That is not a web address.')
    const lay = LAYOUTS.includes(layout) ? layout : 'split'
    const cur = state().open ? get() : null
    // Always an incognito window (nothing is remembered between people). Already open: the page opens as a new tab in that window.
    const args = [`--user-data-dir=${deps.profileDir}`, '--incognito', '--no-first-run', '--no-default-browser-check', ...(cur ? [] : ['--new-window']), href]
    const child = deps.spawn(deps.chrome, args)
    const pid = await deps.place(cur?.pid || child.pid, lay)
    if (!pid) throw new Error('The browser window did not open. Try again.')
    deps.store.save({ pid, layout: lay, at: Date.now(), since: cur?.since || cur?.at || Date.now() })
    log(`BROWSER     ${cur ? 'tab' : 'opened'} ${new URL(href).host} (${lay})`)
    return state()
  }

  async function layout(lay) {
    const s = state().open ? get() : null
    if (!s) throw new Error('The browser is not open.')
    if (!LAYOUTS.includes(lay)) throw new Error('Unknown layout.')
    const pid = await deps.place(s.pid, lay)
    deps.store.save({ ...s, pid: pid || s.pid, layout: lay })
    return state()
  }

  function close() {
    const s = get()
    if (s) { try { deps.kill(s.pid) } catch { /* already closed */ } log('BROWSER     closed') }
    deps.store.save(null)
    return state()
  }

  return { state, open, layout, close }
}
