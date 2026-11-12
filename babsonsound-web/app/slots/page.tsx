'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { SLOT_CATEGORIES, SLOT_RULES, SLOT_TYPES, type SlotType } from '@/lib/slots'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ImagePicker from '@/components/ImagePicker'
import PublicAgreement, { type PublicSignature } from '@/components/PublicAgreement'
import type { AdultStatus } from '@/lib/publicContent'
import HostGate from '@/components/HostGate'
import HostAgreements from '@/components/HostAgreements'
import HostOptions from '@/components/HostOptions'
import { autoHelp, autoLine, type AutoInfo } from '@/lib/slotWording'

interface Mine extends AutoInfo {
  id: string; title: string; type: SlotType; startAt: number; durationMin: number
  status: 'pending' | 'approved' | 'declined' | 'cancelled'; staffNote: string; connectionInfo: string
}

const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240]
const STATUS: Record<Mine['status'], string> = {
  pending: 'PENDING REVIEW', approved: 'APPROVED', declined: 'DECLINED', cancelled: 'CANCELLED',
}
const fmt = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** yyyy-MM-ddTHH:mm in local time, for <input type="datetime-local"> */
function localInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

export default function SlotsPage() {
  const { user, isBabson, loading } = useAuth()
  const member = !!user && isBabson
  const [mine, setMine] = useState<Mine[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())
  const [leadHours, setLeadHours] = useState<number>(SLOT_RULES.minLeadHours) // the staff-set lead time comes from the server
  useEffect(() => { if (member) apiGet<{ rules?: { minLeadHours?: number } }>('/api/slots/options').then(o => { if (typeof o.rules?.minLeadHours === 'number') setLeadHours(o.rules.minLeadHours) }).catch(() => {}) }, [member])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [receiveRatings, setReceiveRatings] = useState(true) // the host sees ratings; listeners can always rate
  const [signing, setSigning] = useState(false) // the request is in; now sign the on-air agreements
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [type, setType] = useState<SlotType>('live')
  const [category, setCategory] = useState('podcast')
  const [start, setStart] = useState(() => localInput(Math.ceil((Date.now() + 25 * 3600_000) / 900_000) * 900_000))
  const [durationMin, setDurationMin] = useState(60)
  const [audioURL, setAudioURL] = useState('')
  const [image, setImage] = useState<{ url: string; path: string } | null>(null)
  const [sharePublic, setSharePublic] = useState(false) // off by default: students only
  const [sig, setSig] = useState<PublicSignature | null>(null)
  const [adult, setAdult] = useState<AdultStatus>('unknown')
  useEffect(() => { if (member) apiGet<{ publicSharing?: AdultStatus }>('/api/me').then(m => setAdult(m.publicSharing ?? 'unknown')).catch(() => {}) }, [member])

  const load = useCallback(async () => {
    try { setMine((await apiGet<{ requests: Mine[] }>('/api/slots/mine')).requests) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your requests.') }
  }, [])
  useEffect(() => { if (member) queueMicrotask(load) }, [member, load])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      const startAt = new Date(start).getTime()
      if (!Number.isFinite(startAt)) throw new Error('Pick a start time.')
      if (sharePublic && !sig) throw new Error('Tick every box and type your full name to share publicly, or turn that off.')
      const sent = await api<{ needsAgreement?: boolean }>('/api/slots/request', { title, description, location, type, category, startAt, durationMin, audioURL, imageUrl: image?.url ?? '', imagePath: image?.path ?? '', receiveRatings, ...(sharePublic && sig ? { publicConsent: sig } : {}) })
      setSharePublic(false); setSig(null)
      setTitle(''); setDescription(''); setLocation(''); setAudioURL(''); setImage(null)
      if (sent?.needsAgreement) setSigning(true)
      else setNotice('Request sent.')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the request.') }
    setBusy(false)
  }

  async function cancel(id: string) {
    setError('')
    try { await api('/api/slots/cancel', { requestId: id, reason }); setCancelling(null); setReason(''); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel.') }
  }

  if (loading) return null
  if (!member) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Host a show</h1>
        <p className="text-lg text-br-dk-sub">
          <Link href="/auth" className="text-br-gold underline underline-offset-4">Sign in</Link> with your Babson email.
        </p>
      </div>
    )
  }

  const box = 'sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none'
  const label = 'block text-sm text-br-dk-sub mb-1.5 font-display tracking-widest'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Host a show</h1>
        <p className="text-lg text-br-dk-sub mt-2">Request a time. At least {leadHours} hours ahead.</p>
      </div>

      {signing && (
        <section className="sk-raised rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-br-gold tracking-widest text-sm">One last step</h2>
          <p className="text-sm text-br-dk-text">Request sent. Sign the on-air agreements next.</p>
          <HostAgreements busy={busy} error={error} onSign={async sig => {
            setBusy(true); setError('')
            try { await api('/api/host/readiness', sig); setSigning(false); setNotice('Signed.'); await load() }
            catch (err) { setError(err instanceof Error ? err.message : 'Could not sign.') }
            setBusy(false)
          }} />
        </section>
      )}

      <HostGate>
      <form onSubmit={submit} className="sk-raised rounded-2xl p-5 space-y-4">
        <Field label="Title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required />
        <label className="block">
          <span className={label}>What&apos;s it about?</span>
          <textarea className={box} rows={3} maxLength={500} required minLength={10} value={description} onChange={e => setDescription(e.target.value)} placeholder="What listeners will hear" />
        </label>
        <Field label="Special requests or location (optional)" value={location} onChange={e => setLocation(e.target.value)} maxLength={120} placeholder="Recording from the Mod Quad, need a second mic…" />
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block"><span className={label}>Format</span>
            <select className={box} value={type} onChange={e => setType(e.target.value as SlotType)}>
              {(Object.keys(SLOT_TYPES) as SlotType[]).map(k => <option key={k} value={k}>{SLOT_TYPES[k]}</option>)}
            </select></label>
          <label className="block"><span className={label}>Category</span>
            <select className={box} value={category} onChange={e => setCategory(e.target.value)}>
              {SLOT_CATEGORIES.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select></label>
          <label className="block"><span className={label}>Start</span>
            <input type="datetime-local" step={900} className={box} value={start} onChange={e => setStart(e.target.value)} required /></label>
          <label className="block"><span className={label}>Length</span>
            <select className={box} value={durationMin} onChange={e => setDurationMin(Number(e.target.value))}>
              {LENGTHS.map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select></label>
        </div>
        {type === 'prerecorded' && (
          <Field label="Link to your audio" type="url" value={audioURL} onChange={e => setAudioURL(e.target.value)} placeholder="https://…" />
        )}
        <ImagePicker scope="slot" value={image} onChange={setImage} />
        <label className="flex items-start gap-2 text-sm text-br-dk-text">
          <input type="checkbox" className="mt-0.5" checked={receiveRatings} onChange={e => setReceiveRatings(e.target.checked)} />
          <span>Receive ratings during my show
            <span className="block text-sm text-br-dk-sub">Off hides ratings from you.</span></span>
        </label>
        <div className="space-y-2 border-t border-br-dk-border pt-4">
          <label className="flex items-center gap-2 text-sm text-br-dk-text">
            <input type="checkbox" checked={sharePublic} disabled={adult !== 'adult'} onChange={e => { setSharePublic(e.target.checked); if (!e.target.checked) setSig(null) }} />
            Also share my recordings with the public (optional)
          </label>
          {adult !== 'adult' && <PublicAgreement status={adult} onChange={() => {}} />}
          {sharePublic && adult === 'adult' && <PublicAgreement status={adult} onChange={setSig} />}
          {!sharePublic && adult === 'adult' && <p className="text-sm text-br-dk-muted">Off: Babson students only.</p>}
        </div>
        <p className="text-sm text-br-dk-muted">Shown to listeners if approved.</p>
        <ErrorText>{error}</ErrorText>
        {notice && <p className="text-sm text-br-gold">{notice}</p>}
        <PrimaryButton type="submit" busy={busy}>Request a slot</PrimaryButton>
      </form>

      <section className="space-y-3">
        <h2 className="font-display text-br-gold tracking-widest text-sm">My requests</h2>
        {mine.length === 0 && <p className="text-sm text-br-dk-sub">You haven&apos;t requested a slot yet.</p>}
        {mine.map(r => (
          <div key={r.id} className="sk-raised rounded-xl p-4 space-y-2">
            <div className="flex justify-between gap-4">
              <p className="text-sm text-br-dk-text">{r.title}</p>
              <span className={`font-display text-sm tracking-widest ${r.status === 'declined' ? 'text-br-red' : r.status === 'approved' ? 'text-br-green' : 'text-br-dk-sub'}`}>{STATUS[r.status]}</span>
            </div>
            <p className="text-sm text-br-dk-sub">{fmt(r.startAt)} · {r.durationMin} min · {SLOT_TYPES[r.type]}</p>
            {r.status === 'pending' && (
              <div>
                <p className="text-base text-br-dk-text">{autoLine(r, now, fmt)}</p>
                {autoHelp(r, now, 'student') && <p className="text-base text-br-dk-sub">{autoHelp(r, now, 'student')}</p>}
              </div>
            )}
            {r.staffNote && <p className="text-sm text-br-dk-text">Staff note: {r.staffNote}</p>}
            {r.status === 'approved' && r.connectionInfo && (
              <pre className="sk-field rounded-lg p-3 text-sm text-br-dk-text whitespace-pre-wrap">{r.connectionInfo}</pre>
            )}
            {(r.status === 'pending' || r.status === 'approved') && r.startAt > now && (
              cancelling === r.id ? (
                <div className="space-y-2">
                  <input className={box} value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Reason (optional), helps us plan" />
                  <div className="flex gap-3">
                    <button onClick={() => cancel(r.id)} className="rounded-lg bg-br-red text-white text-sm font-semibold px-3 py-1.5">Confirm cancel</button>
                    <button onClick={() => { setCancelling(null); setReason('') }} className="text-sm text-br-dk-sub">Keep my show</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCancelling(r.id)} className="rounded-lg border border-br-red text-br-red text-sm font-semibold px-3 py-1.5">
                  {r.status === 'approved' ? 'Cancel this show' : 'Withdraw request'}
                </button>
              )
            )}
          </div>
        ))}
      </section>

      <HostOptions />
      </HostGate>
    </div>
  )
}
