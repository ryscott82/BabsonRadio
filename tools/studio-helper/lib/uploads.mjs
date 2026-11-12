// The upload queue for "Record a show". Kept on disk (queue.json) so nothing is lost when the PC or the helper restarts.
//
// Each saved recording goes through:
//   1. upload    the file to AzuraCast, folder "Student recordings" (flow.js chunks, resumable). Retried with backoff; after
//                UPLOAD_TRIES failures in a row it shows Failed with a Retry button (Retry starts the backoff again).
//   2. site      tell babsonradio.com (POST /api/booth/recordings/start, then /complete). Retried for as long as it takes:
//                the site being down never loses a recording.
//   3. normalize optional (NORMALIZE_RECORDINGS=1): even out the loudness with the PC worker's tool, only after 1 and 2, never while live.
// The local file is never deleted before 1 and 2 have both succeeded; after that it is kept 7 days, then removed.
// Uploads wait while a show is live (so they never take the stream's bandwidth) unless UPLOAD_WHILE_LIVE=1.

import { flowUpload, ensureFolder, findMediaId, recordingFileName } from './flow.mjs'

export const UPLOAD_TRIES = 6
export const KEEP_DAYS = 7
const DAY = 86_400_000

/** Wait before try n (1, 2, …): 2 s, 4 s, 8 s … up to `cap`. */
export const backoffMs = (n, cap = 60_000) => Math.min(cap, 2000 * 2 ** Math.max(0, n - 1))

/** What the page shows for one recording. */
export function phaseOf(it) {
  if (it.upload.state === 'failed') return 'failed'
  if (it.upload.state !== 'done') return 'uploading'
  if (it.site.state !== 'done') return 'saving' // in AzuraCast; the website has not been told yet
  return 'uploaded'
}

export function publicItem(it, now) {
  const due = it.upload.state === 'done' ? it.site.nextAt : it.upload.nextAt
  return {
    id: it.id, title: it.title, uid: it.uid, phase: phaseOf(it), durationSec: it.durationSec, createdAt: it.createdAt,
    percent: it.size ? Math.min(100, Math.round((it.upload.sent / it.size) * 100)) : 0,
    error: it.upload.state === 'done' ? it.site.error : it.upload.error, waitingForLive: !!it.waitingForLive,
    retryInSec: due && due > now ? Math.ceil((due - now) / 1000) : 0, attached: !!it.site.attached, warning: it.site.warning || '',
    normalize: it.normalize?.state || '', keepUntil: it.doneAt ? it.doneAt + KEEP_DAYS * DAY : null,
  }
}

/**
 * deps: { store: { load() -> items[], save(items) }, fs: { size(file), read(file, start, end), remove(file) },
 *         fetch, now(), az: { base, key, station, dir }, site: { url, headers() -> {} }, isLive() -> Promise<boolean>,
 *         uploadWhileLive?, normalize?(item) -> Promise<'done'|'skipped'|'later'>, log? }
 */
export function createUploads(deps) {
  const log = deps.log || (() => {})
  let items = deps.store.load()
  let busy = false
  const save = () => { try { deps.store.save(items) } catch (e) { log('Could not save the upload queue:', e.message) } }

  function add(t) {
    const now = deps.now()
    const filename = recordingFileName(t.title, t.createdAt || now, t.id, t.ext)
    const it = {
      id: t.id, uid: t.uid, name: t.name || '', token: t.token, title: t.title, bookingId: t.bookingId || '', requestId: t.requestId || '',
      cleanConfirmed: t.cleanConfirmed === true, durationSec: Math.max(1, Math.round(t.durationSec || 1)), file: t.file, size: deps.fs.size(t.file),
      createdAt: t.createdAt || now, savedAt: now, filename, azPath: `${deps.az.dir}/${filename}`,
      upload: { state: 'queued', sent: 0, tries: 0, nextAt: 0, error: '' },
      site: { state: 'waiting', tries: 0, nextAt: 0, error: '', recId: '', attached: false, warning: '' },
      mediaId: 0, normalize: deps.normalize ? { state: 'todo', tries: 0, nextAt: 0 } : null, doneAt: 0,
    }
    items = items.filter(x => x.id !== it.id).concat(it)
    save()
    return it
  }

  /** Retry button: try again now, with a fresh backoff. */
  function retry(id) {
    const it = items.find(x => x.id === id)
    if (!it) return false
    if (it.upload.state !== 'done') Object.assign(it.upload, { state: 'queued', tries: 0, nextAt: 0, error: '' })
    else if (it.site.state !== 'done') Object.assign(it.site, { tries: 0, nextAt: 0, error: '' })
    save()
    return true
  }

  async function doUpload(it) {
    it.upload.state = 'uploading'
    try {
      if (!deps.az.key || !deps.az.base) throw new Error('AzuraCast is not set up on this PC (AZURACAST_URL and AZURACAST_API_KEY in .env).')
      const o = { ...deps.az, fetch: deps.fetch }
      await ensureFolder(o)
      await flowUpload({
        ...o, filename: it.filename, identifier: `br-${it.id}`, size: it.size,
        readChunk: (s, e) => deps.fs.read(it.file, s, e), onProgress: sent => { it.upload.sent = sent },
      })
      Object.assign(it.upload, { state: 'done', sent: it.size, error: '', nextAt: 0 })
      log(`UPLOADED    ${it.azPath}`)
    } catch (e) {
      it.upload.tries += 1
      it.upload.error = String(e?.message || e).slice(0, 200)
      if (it.upload.tries >= UPLOAD_TRIES) { it.upload.state = 'failed'; log(`UPLOAD FAILED ${it.id}: ${it.upload.error}`) }
      else { it.upload.state = 'queued'; it.upload.nextAt = deps.now() + backoffMs(it.upload.tries) }
    }
    save()
  }

  async function post(path, body) {
    const res = await deps.fetch(`${deps.site.url}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...deps.site.headers() }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { const e = new Error(data.error || `The website answered ${res.status}.`); e.status = res.status; throw e }
    return data
  }

  async function doSite(it) {
    try {
      if (!it.site.recId) {
        const r = await post('/api/booth/recordings/start', {
          id: it.id, token: it.token, title: it.title, bookingId: it.bookingId || undefined, requestId: it.requestId || undefined, cleanConfirmed: it.cleanConfirmed,
        })
        it.site.recId = String(r.id || it.id)
        save()
      }
      const r = await post('/api/booth/recordings/complete', { id: it.site.recId, token: it.token, azuracastPath: it.azPath, durationSec: it.durationSec })
      Object.assign(it.site, { state: 'done', error: '', nextAt: 0, attached: !!r.attached, warning: String(r.warning || it.site.warning || '') })
      it.doneAt = deps.now()
      log(`SAVED       ${it.id} on the website${r.attached ? ' and attached to the show' : ''}`)
    } catch (e) {
      // The booking or show it was for is gone (cancelled, deleted): save it without that link rather than never.
      if (e.status === 404 && !it.site.recId && (it.bookingId || it.requestId)) {
        log(`SITE        ${it.id}: ${e.message} Saving it without the booking/show.`)
        it.bookingId = ''; it.requestId = ''; it.site.warning = 'The booking or show it was for is gone, so it was saved on its own.'
        save()
        return
      }
      it.site.tries += 1
      it.site.error = e.status ? String(e.message).slice(0, 200) : 'The website can’t be reached. The recording is safe on this PC and will be sent when it can.'
      // Never gives up. A refusal (4xx) is retried slowly (an admin may fix it); the site being down is retried sooner.
      it.site.nextAt = deps.now() + backoffMs(it.site.tries, e.status >= 400 && e.status < 500 ? 30 * 60_000 : 5 * 60_000)
    }
    save()
  }

  async function doNormalize(it) {
    try {
      if (!it.mediaId) it.mediaId = await findMediaId({ ...deps.az, fetch: deps.fetch }, it.azPath)
      if (!it.mediaId) throw new Error('not listed in AzuraCast yet')
      const r = await deps.normalize(it)
      if (r === 'later') { it.normalize.nextAt = deps.now() + 5 * 60_000; return }
      it.normalize.state = r === 'skipped' ? 'skipped' : 'done'
      log(`LOUDNESS    ${it.id}: ${it.normalize.state}`)
    } catch (e) {
      it.normalize.tries += 1
      it.normalize.error = String(e?.message || e).slice(0, 200)
      if (it.normalize.tries >= 3) it.normalize.state = 'failed'
      else it.normalize.nextAt = deps.now() + backoffMs(it.normalize.tries + 4, 30 * 60_000)
    } finally { save() }
  }

  /** One step of work, the most urgent first. Returns true when something was done. */
  async function step() {
    if (busy) return false
    busy = true
    try {
      const now = deps.now()
      const up = items.find(x => (x.upload.state === 'queued' || x.upload.state === 'uploading') && x.upload.nextAt <= now)
      if (up) {
        const live = !deps.uploadWhileLive && (await deps.isLive().catch(() => true))
        up.waitingForLive = live
        if (!live) { await doUpload(up); return true }
      }
      const site = items.find(x => x.upload.state === 'done' && x.site.state !== 'done' && x.site.nextAt <= now)
      if (site) { await doSite(site); return true }
      const norm = deps.normalize && items.find(x => x.site.state === 'done' && x.normalize?.state === 'todo' && x.normalize.nextAt <= now)
      if (norm && !(await deps.isLive().catch(() => true))) { await doNormalize(norm); return true }
      return false
    } finally { busy = false }
  }

  /** Done recordings older than 7 days: the local file is removed and the entry dropped. Nothing else is ever removed. */
  function cleanup() {
    const now = deps.now()
    const old = items.filter(x => x.upload.state === 'done' && x.site.state === 'done' && x.doneAt && now - x.doneAt > KEEP_DAYS * DAY)
    for (const it of old) { try { deps.fs.remove(it.file) } catch { /* already gone */ } }
    if (old.length) { items = items.filter(x => !old.includes(x)); save(); log(`Removed ${old.length} local recording(s) older than ${KEEP_DAYS} days.`) }
    return old.length
  }

  return {
    add, retry, step, cleanup,
    list: (uid) => items.filter(x => !uid || x.uid === uid).map(x => publicItem(x, deps.now())).sort((a, b) => b.createdAt - a.createdAt),
    get: id => items.find(x => x.id === id) || null,
    all: () => items,
  }
}
