// "Record a show": BUTT's recorder only, no stream. BUTT has no pause, so:
//   Start  = BUTT -r                              Pause = BUTT -t, then the file BUTT wrote is moved into this take's folder
//   Resume = BUTT -r (a new piece)                Stop  = like Pause, then the pieces are joined (ffmpeg, no re-encoding)
// Pieces are moved at once because BUTT reuses its file name and would overwrite them. BUTT says where it is writing in its status
// ("record path", BUTT 0.1.34 or newer). Everything is kept in recordings/<id>/ until the upload is confirmed.
// Saved state (recorder.json) means a helper restart in the middle of a recording loses nothing: it comes back paused.

import { randomBytes } from 'node:crypto'

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const newId = (n = 20) => Array.from(randomBytes(n), b => ALNUM[b % ALNUM.length]).join('')

/**
 * deps: { butt(args) -> Promise<string>, status() -> Promise<{connected, connecting, recording, recordPath, recordSeconds}>,
 *         files: { mkdir(dir), move(src, dst), exists(f), removeDir(dir), join(...parts), ext(f) }, concat(list, out) -> Promise,
 *         probe(file) -> Promise<number|0>, store: { load(), save(state) }, dir, now(), sleep(ms), log? }
 */
export function createRecorder(deps) {
  const log = deps.log || (() => {})
  const saved = deps.store.load() || {}
  // cur: the take in progress (recording or paused). takes: stopped takes that are not saved yet.
  let cur = saved.cur || null
  let takes = saved.takes || []
  const persist = () => { try { deps.store.save({ cur, takes }) } catch (e) { log('Could not save recorder state:', e.message) } }

  const elapsedMs = () => (cur ? cur.elapsedMs + (cur.state === 'recording' ? deps.now() - cur.pieceStart : 0) : 0)

  /** BUTT's path while it records. Asked a few times: BUTT opens the file a moment after -r. */
  async function waitPath() {
    for (let i = 0; i < 10; i++) {
      const s = await deps.status().catch(() => null)
      if (s?.recording && s.recordPath) return s.recordPath
      await deps.sleep(200)
    }
    return ''
  }

  /** Stop BUTT's recorder and move the piece it wrote into the take's folder. */
  async function endPiece() {
    const s = await deps.status().catch(() => null)
    const path = s?.recordPath || cur.piecePath
    await deps.butt(['-t'])
    cur.elapsedMs += deps.now() - cur.pieceStart
    cur.state = 'paused'
    if (!path) throw new Error('BUTT did not say where it saved the recording. Update BUTT to 0.1.34 or newer.')
    const dst = deps.files.join(cur.dir, `piece-${String(cur.pieces.length + 1).padStart(3, '0')}${deps.files.ext(path) || '.mp3'}`)
    // BUTT closes the file a moment after -t, and Windows won't move a file that is still open.
    let err = null
    for (let i = 0; i < 25; i++) {
      try { await deps.files.move(path, dst); err = null; break } catch (e) { err = e; await deps.sleep(200) }
    }
    if (err) throw new Error(`Could not move BUTT's recording (${err.message}). It is still at ${path}.`)
    cur.pieces.push({ file: dst, ms: deps.now() - cur.pieceStart })
    cur.piecePath = ''
    persist()
  }

  return {
    state() {
      return {
        state: cur ? cur.state : 'idle', id: cur?.id || '', uid: cur?.uid || '', name: cur?.name || '',
        elapsedSec: Math.floor(elapsedMs() / 1000), lost: !!cur?.lost,
      }
    },
    active: () => !!cur,
    takesFor: uid => takes.filter(t => t.uid === uid).map(({ id, durationSec, createdAt }) => ({ id, durationSec, createdAt })),
    take: id => takes.find(t => t.id === id) || null,

    async start(who) {
      if (cur) throw new Error('A recording is already going. Stop it first.')
      const s = await deps.status()
      if (s.connected || s.connecting) throw new Error('The station is live from this PC. End the show before recording.')
      if (s.recording) throw new Error('BUTT is already recording. Stop it in BUTT first.')
      const id = newId()
      const dir = deps.files.join(deps.dir, id)
      deps.files.mkdir(dir)
      cur = { id, uid: who.u, name: who.n, dir, state: 'recording', createdAt: deps.now(), pieceStart: deps.now(), elapsedMs: 0, pieces: [], piecePath: '' }
      persist()
      try { await deps.butt(['-r']) } catch (e) { deps.files.removeDir(dir); cur = null; persist(); throw e }
      cur.piecePath = await waitPath()
      if (!cur.piecePath) log('BUTT did not report a record path yet; it will be asked again at pause/stop.')
      persist()
      log(`RECORD START ${who.n} (${who.u}) ${id}`)
      return this.state()
    },

    async pause() {
      if (!cur || cur.state !== 'recording') throw new Error('Nothing is recording.')
      await endPiece()
      return this.state()
    },

    async resume() {
      if (!cur || cur.state !== 'paused') throw new Error('Nothing is paused.')
      const s = await deps.status()
      if (s.connected || s.connecting) throw new Error('The station is live from this PC. End the show before recording.')
      await deps.butt(['-r'])
      Object.assign(cur, { state: 'recording', pieceStart: deps.now(), lost: false })
      cur.piecePath = await waitPath()
      persist()
      return this.state()
    },

    /** Stops and joins the pieces. Returns the take: { id, file, durationSec, ext }. */
    async stop() {
      if (!cur) throw new Error('Nothing is recording.')
      if (cur.state === 'recording') await endPiece()
      if (!cur.pieces.length) { deps.files.removeDir(cur.dir); cur = null; persist(); throw new Error('Nothing was recorded.') }
      const ext = deps.files.ext(cur.pieces[0].file) || '.mp3'
      const out = deps.files.join(cur.dir, `recording${ext}`)
      if (cur.pieces.length === 1) await deps.files.move(cur.pieces[0].file, out)
      else await deps.concat(cur.pieces.map(p => p.file), out)
      const probed = await deps.probe(out).catch(() => 0)
      const durationSec = Math.max(1, Math.round(probed || elapsedMs() / 1000))
      const take = { id: cur.id, uid: cur.uid, name: cur.name, file: out, ext, durationSec, createdAt: cur.createdAt }
      takes = takes.filter(t => t.id !== take.id).concat(take)
      log(`RECORD STOP  ${cur.name} ${cur.id} ${durationSec}s in ${cur.pieces.length} piece(s)`)
      cur = null
      persist()
      return take
    },

    /** The take was saved (it is in the upload queue now). */
    forget(id) { takes = takes.filter(t => t.id !== id); persist() },
    /** Delete a take that was never saved (the person pressed Delete and confirmed). */
    discard(id) {
      const t = takes.find(x => x.id === id)
      if (!t) return false
      deps.files.removeDir(deps.files.join(deps.dir, id))
      takes = takes.filter(x => x.id !== id)
      persist()
      log(`RECORD DELETED ${id} (not saved)`)
      return true
    },
  }
}
