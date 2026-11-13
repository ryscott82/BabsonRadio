// Live shows are archived automatically. BUTT already records every show (helper.mjs starts it with the stream); this keeps track of
// WHO is on air and the "Show info" the booth fills in (title, contributors, description, category, editable at any time, even mid-show),
// and when the show ends it moves BUTT's file into the upload queue so it ends up in the Babson Sound library.
//
// State (live.json) survives a helper restart: a show that was on air when the PC rebooted is picked up when the helper starts again.

export const CATEGORIES = ['Music', 'Interview', 'Podcast', 'Talk', 'News']
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)

/** What the booth sends for Show info, made safe. hosts can be an array or text separated by commas / new lines. */
export function cleanShow(b = {}) {
  const raw = Array.isArray(b.hosts) ? b.hosts : String(b.hosts ?? '').split(/[,\n;]+/)
  const hosts = []
  for (const h of raw) {
    const n = clean(h, 60)
    if (n && !hosts.some(x => x.toLowerCase() === n.toLowerCase())) hosts.push(n)
    if (hosts.length >= 12) break
  }
  const cat = CATEGORIES.find(c => c.toLowerCase() === clean(b.category, 30).toLowerCase()) || ''
  return { title: clean(b.title, 80), hosts, description: clean(b.description, 500), category: cat }
}

/**
 * deps: { store: { load(), save(v) }, files: { mkdir(dir), move(src, dst), remove(f), join(...p), ext(f) }, probe(file) -> seconds,
 *         uploads: { add(item) }, newId(), now(), sleep(ms), minSec?, dir, log? }
 */
export function createLiveArchive(deps) {
  const log = deps.log || (() => {})
  const minSec = deps.minSec ?? 60
  const saved = deps.store.load() || {}
  let show = cleanShow(saved.show || {})
  let session = saved.session || null // { id, uid, name, token, startedAt, piecePath }
  const persist = () => { try { deps.store.save({ show, session }) } catch (e) { log('Could not save live.json:', e.message) } }

  return {
    show: () => ({ ...show, onAir: !!session }),
    /** Anyone signed in may edit the show info, before or during the show. */
    setShow(b) { show = cleanShow(b); persist(); return this.show() },
    active: () => !!session,
    /** Went on air. token is the host's control token: the site needs it to file the recording under their name. */
    begin({ uid, name, token }, piecePath = '') {
      if (session) { session.piecePath = piecePath || session.piecePath; persist(); return session.id }
      session = { id: deps.newId(), uid, name: name || '', token, startedAt: deps.now(), piecePath }
      persist()
      return session.id
    },
    /** BUTT said where it is writing (it opens the file a moment after the record command). */
    setPiecePath(p) { if (session && p && session.piecePath !== p) { session.piecePath = p; persist() } },
    /**
     * The show ended: queue BUTT's file for upload. pathHint is BUTT's "record path" read before it was told to stop.
     * Returns 'none' (no show was on air), 'short' (under minSec, thrown away), 'queued', or 'failed' (kept, try again).
     */
    async finish(pathHint = '') {
      const s = session
      if (!s) return 'none'
      const path = pathHint || s.piecePath
      if (!path) { session = null; persist(); log('LIVE ARCHIVE no recording path from BUTT, nothing to upload'); return 'failed' }
      const dir = deps.files.join(deps.dir, s.id)
      deps.files.mkdir(dir)
      const dst = deps.files.join(dir, `show${deps.files.ext(path) || '.mp3'}`)
      // BUTT closes its file a moment after it is told to stop, and Windows will not move a file that is still open.
      let err = null
      for (let i = 0; i < 40; i++) {
        try { await deps.files.move(path, dst); err = null; break } catch (e) { if (e.code === 'ENOENT') { err = e; break } err = e; await deps.sleep(250) }
      }
      if (err) { s.piecePath = path; persist(); log(`LIVE ARCHIVE could not move ${path}: ${err.message}`); return 'failed' }
      let sec = 0
      try { sec = Math.round(await deps.probe(dst)) } catch { /* the site only needs a rough length */ }
      session = null
      if (sec && sec < minSec) { deps.files.remove(dst); persist(); log(`LIVE ARCHIVE ${s.id}: ${sec}s, too short to keep`); return 'short' }
      const startedAt = s.startedAt, endedAt = deps.now()
      const title = show.title || `Live show ${new Date(startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      const hosts = show.hosts.length ? show.hosts : (s.name ? [s.name] : [])
      deps.uploads.add({
        id: s.id, uid: s.uid, name: s.name, token: s.token, title, file: dst, ext: deps.files.ext(dst), createdAt: startedAt,
        durationSec: sec || Math.max(1, Math.round((endedAt - startedAt) / 1000)),
        live: { hosts, description: show.description, category: show.category, startedAt, endedAt },
      })
      show = cleanShow({}) // the next show starts blank
      persist()
      log(`LIVE ARCHIVE ${s.id} "${title}" queued (${sec}s)`)
      return 'queued'
    },
    /** At helper start: a show that was on air when the PC restarted. Only archives if BUTT is not recording any more. */
    async recover(isRecording) {
      if (!session) return 'none'
      if (await isRecording().catch(() => false)) return 'none'
      return this.finish()
    },
  }
}
