'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { SLOT_CATEGORIES, SLOT_RULES, SLOT_TYPES } from '@/lib/slots'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ImagePicker from '@/components/ImagePicker'
import PublicAgreement, { type PublicSignature } from '@/components/PublicAgreement'
import HostAgreements from '@/components/HostAgreements'
import HostOptions from '@/components/HostOptions'
import GuestPicker from '@/components/GuestPicker'
import PolicyBox from '@/components/PolicyBox'
import HostMyShows, { type Mine } from '@/components/HostMyShows'
import { BlockGrid, DayTabs, GridLegend, type Cell } from '@/components/TimeGrid'
import type { AdultStatus } from '@/lib/publicContent'
import { touchesCleanHours } from '@/lib/conduct'
import { blocksOfDay, days as buildDays, overlapsAny, timeLabel, touchesQuiet, type Range } from '@/lib/studioGrid'
import { buildIcs, categoryWord, clearDraft, clampLength, lengthsFor, levelAt, loadDraft, moreLengths, nextOpen, popularLine, saveDraft, studioLine, weekNotice, type ShowType } from '@/lib/hostFlow'
import { guestsProblem, toPayload, type GuestChip } from '@/lib/guestPicker'
import { bannedNotice, fmtWhen, type Standing } from '@/lib/membersPage'

interface Options {
  canLive: boolean; trainedReason: null | 'training' | 'expired'; agreementSigned: boolean
  lastShow: { title: string; description: string; location: string; type: string; category: string; durationMin: number; audioURL: string } | null
  rules: { minLeadHours: number; maxAdvanceDays: number; maxMinutes: number; autoApproveHours: number; maxRepeatWeeks: number; liveMaxMinutes: number; capacity: number; quietWarning: string }
  weekHasShow: Record<string, boolean>
}
interface WeekData { slots: (Range & { pending: boolean })[]; studio: Range[]; quiet: Range[] }
interface Popular { top: { label: string }[]; grid: number[][]; fallback: boolean }
interface Sent { startAt: number; endAt: number; title: string; auto: boolean; line: string; warning: string; count: number; skipped: number }

const DAY_MS = 86_400_000
const STEPS = ['Pick a time', 'Your show', 'Send'] as const

/** Host a show: three steps on one page (time, the show, send), then My shows. Times come from the open-times calls; popular times are only a hint. */
export default function HostShow() {
  const { user, isBabson, loading } = useAuth()
  const member = !!user && isBabson
  const [now] = useState(() => Date.now())
  const [opts, setOpts] = useState<Options | null>(null)
  const [standing, setStanding] = useState<Standing | null>(null)
  const [mine, setMine] = useState<Mine[]>([])
  const [adult, setAdult] = useState<AdultStatus>('unknown')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [signErr, setSignErr] = useState('')

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [type, setType] = useState<ShowType>('live')
  const [length, setLength] = useState(60)
  const [week, setWeek] = useState(0)
  const [dayKey, setDayKey] = useState('')
  const [pick, setPick] = useState<number | null>(null)
  const [overnight, setOvernight] = useState(false)
  const [weeks, setWeeks] = useState<Record<number, WeekData>>({})
  const [popular, setPopular] = useState<Record<string, Popular>>({})

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('podcast')
  const [location, setLocation] = useState('')
  const [audioURL, setAudioURL] = useState('')
  const [image, setImage] = useState<{ url: string; path: string } | null>(null)
  const [receiveRatings, setReceiveRatings] = useState(true)
  const [noStudio, setNoStudio] = useState(false)
  const [sharePublic, setSharePublic] = useState(false)
  const [sig, setSig] = useState<PublicSignature | null>(null)
  const [chips, setChips] = useState<GuestChip[]>([])
  const [justMe, setJustMe] = useState(false)
  const [policy, setPolicy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [sent, setSent] = useState<Sent | null>(null)
  const [recId, setRecId] = useState('')
  const [recClean, setRecClean] = useState(false)

  const allDays = useMemo(() => buildDays(now, 7 * 9), [now])
  const weekDays = useMemo(() => allDays.slice(week * 7, week * 7 + 7), [allDays, week])
  const activeDay = weekDays.find(d => d.key === dayKey) ?? weekDays[0]
  const lead = opts?.rules.minLeadHours ?? SLOT_RULES.minLeadHours
  const maxWeek = Math.min(8, Math.ceil((opts?.rules.maxAdvanceDays ?? SLOT_RULES.maxAdvanceDays) / 7) - 1)
  const weekOf = useCallback((ms: number) => Math.max(0, Math.floor(allDays.findLastIndex(d => d.startMs <= ms) / 7)), [allDays])

  // ── loading: on open, on week change, on category change. Nothing polls. ──
  const loadMine = useCallback(async () => { try { setMine((await apiGet<{ requests: Mine[] }>('/api/slots/mine')).requests) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your shows.') } }, [])
  const loadOpts = useCallback(async () => { try { setOpts(await apiGet<Options>('/api/slots/options')) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') } }, [])

  useEffect(() => {
    if (!member) return
    queueMicrotask(() => { void loadOpts(); void loadMine() })
    apiGet<Standing>('/api/me/standing').then(setStanding).catch(() => {})
    apiGet<{ publicSharing?: AdultStatus }>('/api/me').then(m => setAdult(m.publicSharing ?? 'unknown')).catch(() => {})
  }, [member, loadOpts, loadMine])

  // Start from the draft, the last show and the address (?start=ms&len=min&type=live|prerecorded&recording=id).
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (!opts || seeded) return
    const q = new URLSearchParams(window.location.search)
    const d = loadDraft()
    const t: ShowType = q.get('type') === 'prerecorded' ? 'prerecorded' : q.get('type') === 'live' ? 'live' : (d.type ?? (opts.canLive ? 'live' : 'prerecorded'))
    const useType: ShowType = t === 'live' && !opts.canLive ? 'prerecorded' : t
    const last = opts.lastShow
    queueMicrotask(() => {
      setType(useType)
      setCategory(d.category ?? last?.category ?? 'podcast')
      setTitle(d.title ?? ''); setDescription(d.description ?? ''); setLocation(d.location ?? '')
      const len = Number(q.get('len')) || 0
      setLength(clampLength(useType, len > 0 ? len : 60))
      const start = Number(q.get('start'))
      if (Number.isFinite(start) && start > now) { setPick(start); setWeek(weekOf(start)); const day = allDays.findLast(x => x.startMs <= start); if (day) setDayKey(day.key) }
      setRecId(q.get('recording') ?? '')
      setSeeded(true)
    })
  }, [opts, seeded, now, allDays, weekOf])

  useEffect(() => { if (seeded) saveDraft({ title, description, category, type, location }) }, [seeded, title, description, category, type, location])

  const needWeek = useCallback(async (w: number) => {
    if (weeks[w]) return
    const wd = allDays.slice(w * 7, w * 7 + 7)
    const from = Math.max(now, wd[0].startMs), to = wd[6].startMs + DAY_MS
    try {
      const [s, st] = await Promise.all([
        apiGet<{ ranges: (Range & { pending: boolean })[] }>(`/api/slots/open?from=${from}&to=${to}`),
        apiGet<{ ranges: Range[]; quietRanges: Range[] }>(`/api/studio/open?from=${from}&to=${to}`).catch(() => ({ ranges: [] as Range[], quietRanges: [] as Range[] })),
      ])
      setWeeks(p => ({ ...p, [w]: { slots: s.ranges, studio: st.ranges, quiet: st.quietRanges } }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the open times.') }
  }, [weeks, allDays, now])
  useEffect(() => { if (opts && seeded) queueMicrotask(() => { void needWeek(week) }) }, [opts, seeded, week, needWeek])

  useEffect(() => {
    if (!opts || popular[category]) return
    apiGet<Popular>(`/api/slots/popular?category=${encodeURIComponent(category)}`).then(p => setPopular(prev => ({ ...prev, [category]: p }))).catch(() => {})
  }, [opts, category, popular])

  const usesStudio = type === 'live' && !noStudio
  const rangesFor = useCallback((w: number): Range[] => { const d = weeks[w]; return d ? [...d.slots, ...(usesStudio ? d.studio : [])] : [] }, [weeks, usesStudio])
  const pop = popular[category]

  const cells: Cell[] = useMemo(() => {
    if (!activeDay || !weeks[week]) return []
    const wk = weeks[week]
    const all = rangesFor(week)
    return blocksOfDay(activeDay.startMs, overnight ? 0 : 7, 24).map(ms => {
      const end = ms + 30 * 60_000
      const hit = wk.slots.find(r => r.startAt < end && ms < r.endAt)
      const state = ms < now ? 'past' : ms < now + lead * 3_600_000 ? 'soon' : ms > now + (opts?.rules.maxAdvanceDays ?? 60) * DAY_MS ? 'far' : overlapsAny(all, ms, end) ? 'taken' : 'free'
      return { startMs: ms, state, pending: !!hit?.pending, quiet: type === 'live' && touchesQuiet(wk.quiet, ms, end), level: levelAt(pop?.grid, ms) } as Cell
    })
  }, [activeDay, weeks, week, rangesFor, overnight, now, lead, opts, type, pop])

  const pickEnd = pick ? pick + length * 60_000 : 0
  const conflict = !!pick && overlapsAny(rangesFor(weekOf(pick)), pick, pickEnd)
  const tooSoon = !!pick && pick < now + lead * 3_600_000
  const pickOk = !!pick && !conflict && !tooSoon
  const quiet = type === 'live' && !!pick && !!weeks[weekOf(pick)] && touchesQuiet(weeks[weekOf(pick)].quiet, pick, pickEnd)
  const notice = pick && opts ? weekNotice(pick, opts.weekHasShow, { autoApproveHours: opts.rules.autoApproveHours }) : null
  const next = useMemo(() => (weeks[week] ? nextOpen(rangesFor(week), now, lead, length) : []), [weeks, week, rangesFor, now, lead, length])
  const lengths = lengthsFor(type, opts?.rules.maxMinutes)
  const extra = moreLengths(type, opts?.rules.maxMinutes)
  const banned = bannedNotice(standing)

  function chooseType(t: ShowType) { setType(t); setLength(l => clampLength(t, l)); if (t !== 'live') setNoStudio(false) }
  function pickBlock(ms: number) { setPick(ms) }
  function useLast() {
    const l = opts?.lastShow; if (!l) return
    setTitle(l.title); setDescription(l.description); setLocation(l.location); setCategory(l.category || 'podcast'); if (l.audioURL && type === 'prerecorded') setAudioURL(l.audioURL)
  }
  function pickAnother(m: Mine) {
    chooseType(m.type); setLength(clampLength(m.type, m.durationMin)); setTitle(m.title); setDescription(m.description); setCategory(m.category); setPick(null); setSent(null); setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function sign(s: { typedName: string; accepted: true; version: string }) {
    setBusy(true); setSignErr('')
    try { await api('/api/host/readiness', s); await loadOpts() } catch (e) { setSignErr(e instanceof Error ? e.message : 'Could not sign.') }
    setBusy(false)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault(); setFormErr(''); setError('')
    const p = guestsProblem(chips, justMe)
    if (p) { setFormErr(p); return }
    if (!policy) { setFormErr('Tick the box to agree to the policy.'); return }
    if (sharePublic && !sig) { setFormErr('Tick every box and type your full name to share publicly, or turn that off.'); return }
    if (recId && !recClean) { setFormErr('Listen to the whole recording and tick the box to confirm it is clean.'); return }
    if (!pick || !opts) return
    setBusy(true)
    try {
      const r = await api<{ id: string; ids?: string[]; skipped?: unknown[]; quiet?: boolean; warning?: string }>('/api/slots/request', {
        title, description, location, type, category, startAt: pick, durationMin: length, audioURL: type === 'prerecorded' ? audioURL : '',
        imageUrl: image?.url ?? '', imagePath: image?.path ?? '', receiveRatings, noStudio: type === 'live' && noStudio,
        guests: toPayload(chips), justMe, policyAck: true, ...(sharePublic && sig ? { publicConsent: sig } : {}),
      })
      let line = notice?.line ?? ''
      if (recId && type === 'prerecorded') {
        try { await api('/api/recordings/attach', { recordingId: recId, requestId: r.id, cleanConfirmed: true }); line += ' Your recording is attached and plays at air time.' }
        catch (er) { line += ` The recording could not be attached yet: ${er instanceof Error ? er.message : 'try again from My recordings.'}` }
      }
      setSent({ startAt: pick, endAt: pickEnd, title, auto: notice?.auto ?? false, line, warning: r.warning ?? '', count: r.ids?.length ?? 1, skipped: r.skipped?.length ?? 0 })
      clearDraft(); setTitle(''); setDescription(''); setLocation(''); setAudioURL(''); setImage(null); setChips([]); setJustMe(false); setPolicy(false); setSharePublic(false); setSig(null); setPick(null); setStep(1)
      setWeeks({}); await Promise.all([loadMine(), loadOpts()])
    } catch (er) { setFormErr(er instanceof Error ? er.message : 'Could not send the request.') }
    setBusy(false)
  }

  function downloadIcs(s: Sent) {
    const blob = new Blob([buildIcs({ title: s.title, startAt: s.startAt, endAt: s.endAt, description: 'Babson Radio show' })], { type: 'text/calendar' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'babson-radio-show.ics'; a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading) return null
  if (!member) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Host a show</h1>
        <p className="text-lg text-br-dk-sub"><Link href="/auth" className="text-br-gold underline underline-offset-4">Sign in</Link> with your school email.</p>
      </div>
    )
  }

  const box = 'sk-field w-full rounded-xl px-4 py-3 text-base text-br-dk-text focus:outline-none'
  const label = 'block text-base text-br-dk-sub mb-1.5 font-display tracking-widest'
  const chip = (on: boolean) => `rounded-full px-5 min-h-11 text-base ${on ? 'sk-key text-br-gold ring-1 ring-br-gold' : 'sk-field text-br-dk-text'}`
  const weekLabel = weekDays.length ? `${weekDays[0].label} to ${weekDays[6].label}` : ''
  const step2Ok = title.trim().length > 0 && description.trim().length >= 10

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Host a show</h1>
        <p className="text-lg text-br-dk-sub mt-2">Pick a time, tell us about it, send. At least {lead} hours ahead.</p>
      </div>

      {sent && (
        <section role="status" className="sk-raised rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-br-green text-xl tracking-widest">Request sent</h2>
          <p className="text-lg text-br-dk-text">{sent.title}, {fmtWhen(sent.startAt)} to {timeLabel(sent.endAt)}</p>
          <p className="text-base text-br-dk-text">{sent.line}</p>
          {sent.count > 1 && <p className="text-base text-br-dk-sub">{sent.count} weeks requested{sent.skipped ? `, ${sent.skipped} skipped` : ''}.</p>}
          {sent.warning && <p className="text-base text-br-gold">{sent.warning}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => downloadIcs(sent)} className="sk-key rounded-lg px-4 min-h-11 text-base text-br-dk-text">Add to calendar</button>
            <a href="#mine" className="sk-key rounded-lg px-4 min-h-11 inline-flex items-center text-base text-br-gold">See My shows</a>
          </div>
        </section>
      )}

      {banned ? (
        <p role="status" className="sk-raised rounded-xl p-5 text-lg text-br-dk-text">{banned}</p>
      ) : !opts ? (
        <p className="text-base text-br-dk-sub">Loading…</p>
      ) : !opts.agreementSigned ? (
        <section className="sk-raised rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-br-gold tracking-widest text-lg">Sign once, then you are set</h2>
          <p className="text-base text-br-dk-text">The on-air agreements come first, so there is no surprise after you send.</p>
          <HostAgreements busy={busy} error={signErr} onSign={sign} />
        </section>
      ) : (
        <form onSubmit={send} className="space-y-6">
          <ol className="flex gap-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={step === i + 1 ? 'step' : undefined}
                  className={`flex-1 rounded-lg px-3 py-2 text-base text-center ${step === i + 1 ? 'sk-key text-br-gold ring-1 ring-br-gold' : step > i + 1 ? 'sk-field text-br-dk-text' : 'sk-field text-br-dk-sub'}`}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <section className="space-y-5" aria-label="Pick a time">
              <div role="group" aria-label="Format" className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={type === 'live'} disabled={!opts.canLive} onClick={() => chooseType('live')} className={`${chip(type === 'live')} disabled:opacity-50`}>{SLOT_TYPES.live}</button>
                <button type="button" aria-pressed={type === 'prerecorded'} onClick={() => chooseType('prerecorded')} className={chip(type === 'prerecorded')}>{SLOT_TYPES.prerecorded}</button>
              </div>
              {!opts.canLive && (
                <p className="text-base text-br-dk-sub">
                  {opts.trainedReason === 'expired' ? 'Your radio training has ended, so live is paused. ' : 'Live shows need radio training first. '}
                  <Link href="/members#training" className="text-br-gold underline underline-offset-4">{opts.trainedReason === 'expired' ? 'Renew your training' : 'Finish radio training'}</Link>. Pre-recorded is open now.
                </p>
              )}
              <div className="space-y-2">
                <p className={label}>Length</p>
                <div role="group" aria-label="Length" className="flex flex-wrap gap-2">
                  {lengths.map(m => <button key={m} type="button" aria-pressed={length === m} onClick={() => setLength(m)} className={chip(length === m)}>{m} min</button>)}
                  {extra.length > 0 && (
                    <select aria-label="More lengths" value={extra.includes(length) ? length : ''} onChange={e => e.target.value && setLength(Number(e.target.value))} className="sk-field rounded-full px-4 min-h-11 text-base text-br-dk-text">
                      <option value="">More</option>
                      {extra.map(m => <option key={m} value={m}>{m} min</option>)}
                    </select>
                  )}
                </div>
                {type === 'live' && <p className="text-base text-br-dk-sub">Live shows are up to {opts.rules.liveMaxMinutes} minutes. {studioLine(type, noStudio)}</p>}
              </div>

              {next.length > 0 && (
                <div className="space-y-2">
                  <p className={label}>Next open times</p>
                  <div className="flex flex-wrap gap-2">
                    {next.map(ms => <button key={ms} type="button" onClick={() => { setPick(ms); setWeek(weekOf(ms)); const d = allDays.findLast(x => x.startMs <= ms); if (d) setDayKey(d.key) }} aria-pressed={pick === ms} className={chip(pick === ms)}>{fmtWhen(ms)}</button>)}
                  </div>
                </div>
              )}

              <DayTabs days={weekDays} dayKey={activeDay?.key ?? ''} onDay={setDayKey} weekLabel={weekLabel}
                       onPrev={() => { setWeek(w => w - 1); setDayKey('') }} onNext={() => { setWeek(w => w + 1); setDayKey('') }} canPrev={week > 0} canNext={week < maxWeek} />
              {!weeks[week] ? <p className="text-base text-br-dk-sub">Loading times…</p> : <BlockGrid cells={cells} selected={pick} onPick={pickBlock} showPopular label={`Times, ${activeDay?.label ?? ''}`} />}
              <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11"><input type="checkbox" className="w-5 h-5" checked={overnight} onChange={e => setOvernight(e.target.checked)} />Show overnight times (midnight to 7 AM)</label>
              <GridLegend quiet={type === 'live'} popular={!!pop?.top.length} />
              {pop && popularLine(category, pop.top, pop.fallback) && <p className="text-base text-br-dk-text">{popularLine(category, pop.top, pop.fallback)}</p>}

              {pick && (
                <div className="space-y-2 border-t border-br-dk-border pt-4" role="status">
                  <p className="text-lg text-br-dk-text">{fmtWhen(pick)} to {timeLabel(pickEnd)}</p>
                  {tooSoon && <p className="text-base text-br-red">That is less than {lead} hours away. Pick a later time.</p>}
                  {conflict && !tooSoon && <p className="text-base text-br-red">{length} minutes runs into another booking. Pick a shorter length or another time.</p>}
                  {pickOk && notice && <p className="text-base text-br-dk-text">{notice.line}</p>}
                  {quiet && <p className="text-base text-br-gold">{opts.rules.quietWarning}</p>}
                  {touchesCleanHours(pick, pickEnd) && <p className="text-base text-br-dk-sub">This time is in clean hours (6 AM to 10 PM): no explicit music or language.</p>}
                </div>
              )}
              <PrimaryButton type="button" disabled={!pickOk} onClick={() => setStep(2)}>Next: your show</PrimaryButton>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5" aria-label="Your show">
              {opts.lastShow && <button type="button" onClick={useLast} className="sk-key rounded-lg px-4 min-h-11 text-base text-br-dk-text">Use details from my last show</button>}
              <Field label="Title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required />
              <label className="block">
                <span className={label}>What&apos;s it about? (one line)</span>
                <textarea className={box} rows={2} maxLength={500} minLength={10} value={description} onChange={e => setDescription(e.target.value)} placeholder="What listeners will hear" />
              </label>
              <label className="block">
                <span className={label}>Category</span>
                <select className={box} value={category} onChange={e => setCategory(e.target.value)}>
                  {SLOT_CATEGORIES.map(c => <option key={c} value={c}>{categoryWord(c)}</option>)}
                </select>
              </label>
              {type === 'prerecorded' && <Field label="Link to your audio (optional, you can add it later in My shows)" type="url" value={audioURL} onChange={e => setAudioURL(e.target.value)} placeholder="https://…" />}
              <details className="sk-field rounded-xl p-4 space-y-4">
                <summary className="text-base text-br-dk-text cursor-pointer min-h-11 flex items-center">More options</summary>
                <div className="space-y-4 pt-3">
                  <Field label="Special requests or location (optional)" value={location} onChange={e => setLocation(e.target.value)} maxLength={120} placeholder="Recording from the Mod Quad, need a second mic…" />
                  {type === 'live' && (
                    <div className="space-y-1">
                      <p className="text-base text-br-dk-text">{studioLine(type, noStudio)}</p>
                      <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11"><input type="checkbox" className="w-5 h-5" checked={noStudio} onChange={e => setNoStudio(e.target.checked)} />I am not using the studio</label>
                    </div>
                  )}
                  <ImagePicker scope="slot" value={image} onChange={setImage} />
                  <label className="flex items-start gap-3 text-base text-br-dk-text">
                    <input type="checkbox" className="mt-1 w-5 h-5" checked={receiveRatings} onChange={e => setReceiveRatings(e.target.checked)} />
                    <span>Receive ratings during my show<span className="block text-base text-br-dk-sub">Off hides ratings from you.</span></span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11">
                      <input type="checkbox" className="w-5 h-5" checked={sharePublic} disabled={adult !== 'adult'} onChange={e => { setSharePublic(e.target.checked); if (!e.target.checked) setSig(null) }} />
                      Also share my recordings with the public (optional)
                    </label>
                    {adult !== 'adult' && <PublicAgreement status={adult} onChange={() => {}} />}
                    {sharePublic && adult === 'adult' && <PublicAgreement status={adult} onChange={setSig} />}
                    {!sharePublic && adult === 'adult' && <p className="text-base text-br-dk-muted">Off: Babson students only.</p>}
                  </div>
                </div>
              </details>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)} className="sk-key rounded-lg px-5 min-h-12 text-base text-br-dk-text">Back</button>
                <div className="flex-1"><PrimaryButton type="button" disabled={!step2Ok} onClick={() => setStep(3)}>Next: send</PrimaryButton></div>
              </div>
            </section>
          )}

          {step === 3 && pick && (
            <section className="space-y-5" aria-label="Send">
              <div className="sk-field rounded-xl p-4 space-y-1">
                <p className="text-lg text-br-dk-text">{title}</p>
                <p className="text-base text-br-dk-sub">{fmtWhen(pick)} to {timeLabel(pickEnd)} · {length} min · {SLOT_TYPES[type]} · {categoryWord(category)}</p>
                {type === 'live' && <p className="text-base text-br-dk-sub">{studioLine(type, noStudio)}</p>}
                {quiet && <p className="text-base text-br-gold">{opts.rules.quietWarning}</p>}
                {notice && <p className="text-base text-br-dk-text">{notice.line}</p>}
              </div>
              <GuestPicker chips={chips} onChips={setChips} justMe={justMe} onJustMe={setJustMe} capacity={opts.rules.capacity} />
              {recId && type === 'prerecorded' && (
                <label className="flex items-start gap-3 text-base text-br-dk-text">
                  <input type="checkbox" className="mt-1 w-5 h-5" checked={recClean} onChange={e => setRecClean(e.target.checked)} />
                  <span>I listened to the whole recording and it is clean.</span>
                </label>
              )}
              <PolicyBox checked={policy} onChange={setPolicy} />
              <ErrorText>{formErr}</ErrorText>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(2)} className="sk-key rounded-lg px-5 min-h-12 text-base text-br-dk-text">Back</button>
                <div className="flex-1"><PrimaryButton type="submit" busy={busy}>Request this time</PrimaryButton></div>
              </div>
            </section>
          )}
        </form>
      )}
      <ErrorText>{error}</ErrorText>

      <HostMyShows items={mine} now={now} maxRepeatWeeks={opts?.rules.maxRepeatWeeks ?? 0} onChanged={async () => { setWeeks({}); await Promise.all([loadMine(), loadOpts()]) }} onPickAnother={pickAnother} />
      {opts?.canLive && <HostOptions />}
    </div>
  )
}
