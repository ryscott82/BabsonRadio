'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { BOOTH_HELPER_ORIGIN, type LevelState } from '@/lib/booth'
import { useMicCheck } from './CheckButton'
import { Btn, Led, Sw } from './es2/Stage'
import { errText, helper, mmss } from './helper'
import Modal from './Modal'

// "Record a show": BUTT's recorder only, no stream. A mic check, then Record / Pause / Resume / Stop on the panel's big key. After Stop: listen back,
// give it a title, pick the booking or pre-recorded show it is for, and Save. The studio helper keeps the file on this PC and uploads it
// straight to AzuraCast (folder "Student recordings"), then tells the website. Nothing here waits on the website.

export interface Upload {
  id: string; title: string; phase: 'uploading' | 'saving' | 'uploaded' | 'failed'; percent: number; error: string
  waitingForLive: boolean; retryInSec: number; attached: boolean; warning: string; createdAt: number
}
interface Take { id: string; durationSec: number; createdAt: number }
export interface RecState {
  canRecord: boolean
  recorder: { state: 'idle' | 'recording' | 'paused'; id: string; uid: string; name: string; elapsedSec: number }
  takes: Take[]; uploads: Upload[]
}

/** Polls the helper for the recorder and my uploads (local only, every 2 seconds). */
export function useRecState(getToken: () => Promise<string>) {
  const [st, setSt] = useState<RecState | null>(null)
  const load = useCallback(async () => {
    try { setSt(await helper<RecState>(`/record/state?token=${encodeURIComponent(await getToken())}`)) } catch { /* helper down: the page says so */ }
  }, [getToken])
  useEffect(() => {
    const first = setTimeout(load, 0), t = setInterval(load, 2000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [load])
  return { st, reload: load }
}

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function RecordShow(p: {
  st: RecState | null; reload: () => void; getToken: () => Promise<string>; live: boolean; ready: boolean; level: LevelState; myUid: string
  /** The small key above the big one is free (Stay is not showing there). */
  extra: boolean
  /** One line about uploads and unsaved takes, for the panel's read-out ('' when there is nothing to say). */
  onStatus: (text: string) => void
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<Take | null>(null)
  const [soundOk, toggleMic] = useMicCheck(p.level)

  const act = async (label: string, path: string, then?: (r: { id?: string; durationSec?: number; mine?: boolean }) => void) => {
    setBusy(label); setError('')
    try { const r = await helper<{ id?: string; durationSec?: number; mine?: boolean }>(path, { token: await p.getToken() }); then?.(r); p.reload() }
    catch (e) { setError(errText(e)) } finally { setBusy('') }
  }

  const rec = p.st?.recorder
  const mine = !!rec && rec.uid === p.myUid
  const going = rec && rec.state !== 'idle'

  const retry = async (id: string) => {
    setError('')
    try { await helper('/uploads/retry', { token: await p.getToken(), id }); p.reload() } catch (e) { setError(errText(e)) }
  }
  const unsaved = (p.st?.takes ?? []).filter(t => t.id !== saving?.id)
  const uploads = p.st?.uploads ?? []
  const failed = uploads.find(u => u.phase === 'failed')
  const busyUp = failed ?? uploads.find(u => u.phase !== 'uploaded')
  // One line for the panel's read-out: an error, an upload that is not done yet, or a take that is not saved.
  const status = error || (busyUp ? `${busyUp.title}: ${uploadWord(busyUp)}${busyUp.retryInSec ? `, again in ${mmss(busyUp.retryInSec)}` : ''}${busyUp.error ? `. ${busyUp.error}` : ''}`
    : uploads.find(u => u.warning)?.warning || (unsaved.length ? `Not saved yet: ${mmss(unsaved[0].durationSec)} recorded at ${clockTime(unsaved[0].createdAt)}` : ''))
  const { onStatus } = p
  useEffect(() => { onStatus(status) }, [status, onStatus])
  useEffect(() => () => onStatus(''), [onStatus])

  const why = !p.st ? 'Waiting for the studio helper' : !p.st.canRecord ? 'Take the training to record' : p.live ? 'End the live show first' : !p.ready ? 'BUTT isn’t answering' : soundOk ? 'Records in BUTT only, nothing goes on air' : 'Say something into the mic'
  return (
    <>
      {going ? (
        <>
          {rec.state === 'recording'
            ? <Btn id="modelive" disabled={!!busy} onClick={() => act('pause', '/record/pause')}>{busy === 'pause' ? 'Pausing…' : 'Pause'}</Btn>
            : <Btn id="modelive" disabled={!!busy || !mine} onClick={() => act('resume', '/record/resume')}>{busy === 'resume' ? 'Resuming…' : 'Resume'}</Btn>}
          <div className="eng s" style={{ left: 12, top: 329 }}>{rec.state === 'paused' ? 'Paused' : 'Recording'}{mine ? '' : `, started by ${rec.name}`}. Not on air.</div>
          <Btn id="golive" kind="lv" on disabled={!!busy}
               onClick={() => act('stop', '/record/stop', r => { if (r.id && r.mine) setSaving({ id: r.id, durationSec: r.durationSec ?? 0, createdAt: Date.now() }) })}>
            <b>{busy === 'stop' ? 'Stopping…' : 'Stop recording'}</b>
            <span>{mmss(rec.elapsedSec)} recorded</span>
          </Btn>
        </>
      ) : (
        <>
          <Sw id="micsw" on={soundOk} onChange={toggleMic} label="Mic check" /><Led id="micled" c={soundOk ? 'green' : ''} />
          <div className="eng s" style={{ left: 12, top: 329 }}>Check to record:</div>
          <div className="eng s" style={{ left: 162, top: 329 }}>Mic check (ticks itself when we hear you)</div>
          <Btn id="golive" kind="lv" onClick={() => act('start', '/record/start')} disabled={!!busy || !soundOk || !p.st?.canRecord || p.live || !p.ready}>
            <b>{busy === 'start' ? 'Starting…' : 'Record'}</b>
            <span>{why}</span>
          </Btn>
        </>
      )}
      {/* The small key above the big one: try a failed upload again, or open a take that is not saved yet. */}
      {p.extra && failed ? <Btn id="adsbtn" onClick={() => retry(failed.id)}>Retry upload</Btn>
        : p.extra && unsaved.length ? <Btn id="adsbtn" onClick={() => setSaving(unsaved[0])}>Open unsaved take</Btn> : null}
      {saving && <SaveTake take={saving} getToken={p.getToken} onDone={() => { setSaving(null); p.reload() }} />}
    </>
  )
}

const uploadWord = (u: Upload) =>
  u.phase === 'uploaded' ? (u.attached ? 'Uploaded, attached to your show' : 'Uploaded')
    : u.phase === 'failed' ? 'Failed. The recording stays on this computer'
      : u.phase === 'saving' ? 'Uploaded. Telling the website…'
        : u.waitingForLive ? 'Waiting until the live show ends' : `Uploading ${u.percent}%`

interface Option { id: string; label: string }

/** After Stop: listen back, title, what it is for, Save (or Delete). */
function SaveTake({ take, getToken, onDone }: { take: Take; getToken: () => Promise<string>; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [forWhat, setForWhat] = useState('')
  const [clean, setClean] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [src, setSrc] = useState('')
  const [bookings, setBookings] = useState<Option[]>([])
  const [shows, setShows] = useState<Option[]>([])

  // One token for the whole listen-back, so the player doesn't reload when the token refreshes.
  useEffect(() => { getToken().then(t => setSrc(`${BOOTH_HELPER_ORIGIN}/record/file/${take.id}?token=${encodeURIComponent(t)}`)).catch(() => {}) }, [take.id, getToken])

  // What it can be for: my bookings from today, and my upcoming pre-recorded shows. If the site can't be reached, the list is just empty.
  useEffect(() => {
    const day = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    const now = Date.now()
    apiGet<{ upcoming: { id: string; startAt: number; endAt: number }[]; past: { id: string; startAt: number; endAt: number }[] }>('/api/studio/mine')
      .then(r => setBookings([...r.upcoming, ...r.past].filter(b => Math.abs(b.startAt - now) < 12 * 3_600_000).sort((a, b) => a.startAt - b.startAt)
        .map(b => ({ id: `b:${b.id}`, label: `Studio booking ${clockTime(b.startAt)} to ${clockTime(b.endAt)}` }))))
      .catch(() => {})
    apiGet<{ requests: { id: string; title: string; type: string; status: string; startAt: number }[] }>('/api/slots/mine')
      .then(r => setShows(r.requests.filter(q => q.type === 'prerecorded' && (q.status === 'pending' || q.status === 'approved') && q.startAt > now)
        .map(q => ({ id: `r:${q.id}`, label: `Pre-recorded show: ${q.title}, ${day(q.startAt)} ${clockTime(q.startAt)}` }))))
      .catch(() => {})
  }, [])

  const isShow = forWhat.startsWith('r:')
  const save = async () => {
    setBusy('save'); setError('')
    try {
      await helper('/record/save', {
        token: await getToken(), id: take.id, title: title.trim(),
        bookingId: forWhat.startsWith('b:') ? forWhat.slice(2) : '', requestId: isShow ? forWhat.slice(2) : '', cleanConfirmed: isShow && clean,
      })
      onDone()
    } catch (e) { setError(errText(e)) } finally { setBusy('') }
  }
  const remove = async () => {
    setBusy('delete'); setError('')
    try { await helper('/record/discard', { token: await getToken(), id: take.id }); onDone() } catch (e) { setError(errText(e)) } finally { setBusy('') }
  }

  return (
    <Modal onClose={() => { /* stays open until Save or Delete: the recording must not be lost by a stray tap */ }}>
      <div className="space-y-5">
        <h2 className="hw-title text-4xl">Save your recording</h2>
        <p className="lbl text-xl">{mmss(take.durationSec)} recorded. Listen back, give it a title, and save. It uploads by itself.</p>
        {src && <audio controls preload="metadata" src={src} className="w-full" />}
        <input aria-label="Title" placeholder="Title" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} className="gfield w-full px-5 h-14 text-xl" />
        <label className="block space-y-1.5">
          <span className="block hw-title text-2xl">What is it for?</span>
          <select value={forWhat} onChange={e => { setForWhat(e.target.value); setClean(false) }} className="gfield w-full px-4 h-14 text-xl">
            <option value="">Nothing in particular</option>
            {bookings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            {shows.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        {isShow && (
          <button type="button" className="gbtn w-full h-14 text-lg text-left px-4" aria-pressed={clean} onClick={() => setClean(x => !x)}>
            {clean ? '✓ ' : ''}I listened to the whole recording and it is clean. Attach it to this show.
          </button>
        )}
        {error && <p className="text-xl warn">{error}</p>}
        {confirmDelete ? (
          <div className="flex gap-3">
            <button type="button" className="gbtn flex-1 h-16 text-2xl" onClick={() => setConfirmDelete(false)}>Keep it</button>
            <button type="button" className="gbtn gbtn-stop flex-1 h-16 text-2xl" disabled={!!busy} onClick={remove}>{busy === 'delete' ? 'Deleting…' : 'Delete for good'}</button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button type="button" className="gbtn h-16 px-6 text-2xl" onClick={() => setConfirmDelete(true)}>Delete</button>
            <button type="button" className="gbtn h-16 px-6 text-2xl" onClick={onDone}>Later</button>
            <button type="button" className="gbtn gbtn-go flex-1 h-16 text-2xl" disabled={!!busy || !title.trim()} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
