'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, apiDelete, apiGet } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'
import GuestPicker from '@/components/GuestPicker'
import PolicyBox from '@/components/PolicyBox'
import { BlockGrid, DayTabs, GridLegend, type Cell } from '@/components/TimeGrid'
import { blockState, blocksOfDay, cancelInfo, days as buildDays, holdState, lengthChips, longestFrom, pickLength, quietWarning, timeLabel, touchesQuiet, WALK_IN_NOTE, type Range } from '@/lib/studioGrid'
import { guestsProblem, toPayload, type GuestChip } from '@/lib/guestPicker'
import { bannedNotice, canSchedule, fmtWhen, mmss, recordingWord, type Standing } from '@/lib/membersPage'
import { nyParts, nyToMs } from '@/lib/slotAuto'

interface GridRules { openHour: number; closeHour: number; stepMinutes: number; minMinutes: number; maxMinutes: number; maxHolds: number; lookAheadDays: number; cancelHours: number; capacity: number }
interface Grid { from: number; to: number; ranges: Range[]; quietRanges: Range[]; warning: string; rules: GridRules }
interface Booking { id: string; startAt: number; endAt: number; durationMin: number; status: string; guests: { name: string }[]; justMe: boolean; quiet: boolean }
export interface Mine { upcoming: Booking[]; past: Booking[]; held: number; maxHolds: number }
interface Rec { id: string; title: string; status: string; durationSec: number; requestId: string; createdAt: number; scheduled: boolean }
interface Booked { id: string; startAt: number; endAt: number; durationMin: number; quiet: boolean; warning: string }

/** The Studio card on Members: book, my bookings, my recordings. Needs the Studio badge (otherwise "Get trained"). Loads when opened and when the week changes; nothing polls. */
export default function StudioBooking({ standing, onMine }: { standing: Standing | null; onMine?: (m: Mine) => void }) {
  const { studioTrained } = useAuth()
  const [now] = useState(() => Date.now())
  const [week, setWeek] = useState(0)
  const [grids, setGrids] = useState<Record<number, Grid>>({})
  const [dayKey, setDayKey] = useState('')
  const [pick, setPick] = useState<number | null>(null)
  const [len, setLen] = useState(60)
  const [chips, setChips] = useState<GuestChip[]>([])
  const [justMe, setJustMe] = useState(false)
  const [policy, setPolicy] = useState(false)
  const [mine, setMine] = useState<Mine | null>(null)
  const [recs, setRecs] = useState<Rec[] | null>(null)
  const [done, setDone] = useState<Booked | null>(null)
  const [err, setErr] = useState('')
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [askCancel, setAskCancel] = useState('')
  const banned = bannedNotice(standing)

  const weekDays = useMemo(() => buildDays(now, 7 * (week + 1)).slice(week * 7), [now, week])
  const activeDay = weekDays.find(d => d.key === dayKey) ?? weekDays[0]
  const grid = grids[week]

  const loadGrid = useCallback(async (w: number, force = false) => {
    const wd = buildDays(now, 7 * (w + 1)).slice(w * 7)
    if (!force && grids[w]) return
    try {
      const g = await apiGet<Grid>(`/api/studio/open?from=${Math.max(now, wd[0].startMs)}&to=${wd[6].startMs + 86_400_000}`)
      setGrids(prev => ({ ...prev, [w]: g }))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the studio times.') }
  }, [now, grids])

  const loadMine = useCallback(async () => {
    try { const m = await apiGet<Mine>('/api/studio/mine'); setMine(m); onMine?.(m) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load your bookings.') }
  }, [onMine])

  useEffect(() => { if (studioTrained) { queueMicrotask(() => { void loadMine() }); apiGet<{ recordings: Rec[] }>('/api/recordings/mine').then(r => setRecs(r.recordings)).catch(() => setRecs([])) } }, [studioTrained, loadMine])
  useEffect(() => { if (studioTrained && !banned) queueMicrotask(() => { void loadGrid(week) }) }, [studioTrained, banned, week, loadGrid])

  const rules = grid?.rules
  const cells: Cell[] = useMemo(() => {
    if (!grid || !rules || !activeDay) return []
    return blocksOfDay(activeDay.startMs, rules.openHour, rules.closeHour).map(ms => {
      const state = blockState(ms, { ranges: grid.ranges, now, lookAheadDays: rules.lookAheadDays })
      return { startMs: ms, state, quiet: touchesQuiet(grid.quietRanges, ms, ms + 30 * 60_000) }
    })
  }, [grid, rules, activeDay, now])

  const closeMs = useMemo(() => {
    if (!rules || !activeDay) return 0
    const p = nyParts(activeDay.startMs + 3_600_000)
    return nyToMs(p.y, p.m, p.d, rules.closeHour, 0)
  }, [rules, activeDay])
  const longest = grid && rules && pick ? longestFrom(pick, { ranges: grid.ranges, closeMs, maxMinutes: rules.maxMinutes }) : 0
  const chipsLen = rules ? lengthChips(longest, rules.minMinutes, rules.maxMinutes) : []
  const length = pickLength(len, chipsLen)
  const warn = grid && pick && length ? quietWarning(grid.quietRanges, pick, pick + length * 60_000) : ''
  const hold = holdState(mine?.held ?? 0, rules?.maxHolds ?? mine?.maxHolds ?? 2)

  async function book(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setFormErr('')
    const p = guestsProblem(chips, justMe)
    if (p) { setFormErr(p); return }
    if (!policy) { setFormErr('Tick the box to agree to the policy.'); return }
    if (!pick || !length) return
    setBusy(true)
    try {
      const r = await api<Booked>('/api/studio/book', { startAt: pick, durationMin: length, guests: toPayload(chips), justMe, policyAck: true })
      setDone(r); setPick(null); setChips([]); setJustMe(false); setPolicy(false)
      await Promise.all([loadGrid(week, true), loadMine()])
    } catch (error) { setErr(error instanceof Error ? error.message : 'Could not book the studio.') }
    setBusy(false)
  }

  async function cancel(id: string) {
    setErr(''); setBusy(true)
    try { await api('/api/studio/cancel', { id }); setAskCancel(''); await Promise.all([loadGrid(week, true), loadMine()]) }
    catch (error) { setErr(error instanceof Error ? error.message : 'Could not cancel.') }
    setBusy(false)
  }

  async function removeRec(id: string) {
    try { await apiDelete(`/api/recordings/${id}`, {}); setRecs(r => (r ?? []).filter(x => x.id !== id)) }
    catch (error) { setErr(error instanceof Error ? error.message : 'Could not delete the recording.') }
  }

  if (!studioTrained) {
    return (
      <div className="space-y-3">
        <p className="text-base text-br-dk-text">Booking the studio needs the Studio badge. Training takes one session.</p>
        <p className="text-base text-br-dk-sub">{WALK_IN_NOTE}</p>
        <a href="#training" className="sk-key hw-pill inline-flex items-center justify-center h-11 px-5 rounded-full text-base font-semibold">Get trained</a>
      </div>
    )
  }

  const weekLabel = weekDays.length ? `${weekDays[0].label === 'Today' ? 'Today' : weekDays[0].label} to ${weekDays[6].label}` : ''
  const maxWeek = Math.ceil((rules?.lookAheadDays ?? 30) / 7) - 1

  return (
    <div className="space-y-6">
      <p className="text-base text-br-dk-sub">{WALK_IN_NOTE}</p>
      <ErrorText>{err}</ErrorText>

      {done && (
        <div role="status" className="sk-raised rounded-xl p-4 space-y-2">
          <p className="text-lg text-br-green">Booked: {fmtWhen(done.startAt)} to {timeLabel(done.endAt)}.</p>
          {done.warning && <p className="text-base text-br-gold">{done.warning}</p>}
          <Link href={`/slots?start=${done.startAt}&len=${Math.min(done.durationMin, 90)}&type=live`} className="inline-block text-base text-br-gold underline underline-offset-4">Schedule this to air</Link>
        </div>
      )}

      {banned ? (
        <p role="status" className="sk-raised rounded-xl p-4 text-base text-br-dk-text">{banned}</p>
      ) : (
        <form onSubmit={book} className="space-y-4">
          <p className="text-base text-br-dk-text">{hold.line}</p>
          {hold.full ? (
            <p className="text-base text-br-dk-sub">The booking grid opens again when you cancel one or one of them ends.</p>
          ) : (
            <>
              <DayTabs days={weekDays} dayKey={activeDay?.key ?? ''} onDay={k => { setDayKey(k); setPick(null) }} weekLabel={weekLabel}
                       onPrev={() => { setWeek(w => w - 1); setDayKey(''); setPick(null) }} onNext={() => { setWeek(w => w + 1); setDayKey(''); setPick(null) }}
                       canPrev={week > 0} canNext={week < maxWeek} />
              {!grid ? <p className="text-base text-br-dk-sub">Loading…</p> : (
                <>
                  <BlockGrid cells={cells} selected={pick} onPick={ms => { setPick(ms); setDone(null) }} label={`Studio times, ${activeDay?.label ?? ''}`} />
                  <GridLegend quiet />
                </>
              )}
              {pick && (
                <div className="space-y-4 border-t border-br-dk-border pt-4">
                  <p className="text-lg text-br-dk-text">{fmtWhen(pick)}{length ? ` to ${timeLabel(pick + length * 60_000)}` : ''}</p>
                  <div role="group" aria-label="Length" className="flex flex-wrap gap-2">
                    {chipsLen.map(m => (
                      <button key={m} type="button" aria-pressed={length === m} onClick={() => setLen(m)}
                              className={`rounded-full px-5 min-h-11 text-base ${length === m ? 'sk-key text-br-gold ring-1 ring-br-gold' : 'sk-field text-br-dk-text'}`}>{m} min</button>
                    ))}
                  </div>
                  {warn && <p role="status" className="text-base text-br-gold">{warn}</p>}
                  <GuestPicker chips={chips} onChips={setChips} justMe={justMe} onJustMe={setJustMe} capacity={rules?.capacity ?? 12} />
                  <PolicyBox checked={policy} onChange={setPolicy} />
                  <ErrorText>{formErr}</ErrorText>
                  <PrimaryButton type="submit" busy={busy}>Book the studio</PrimaryButton>
                </div>
              )}
            </>
          )}
        </form>
      )}

      <section aria-label="My bookings" className="space-y-3">
        <h3 className="font-display text-br-dk-text text-lg tracking-widest">My bookings</h3>
        {mine && mine.upcoming.length === 0 && <p className="text-base text-br-dk-sub">Nothing booked. Walk in anytime the studio is free.</p>}
        {mine?.upcoming.map(b => {
          const c = cancelInfo(b.startAt, now, rules?.cancelHours ?? 2)
          return (
            <div key={b.id} className="sk-field rounded-xl p-4 space-y-2">
              <p className="text-base text-br-dk-text">{fmtWhen(b.startAt)} to {timeLabel(b.endAt)} · {b.durationMin} min</p>
              <p className="text-base text-br-dk-sub">{b.justMe ? 'Just you' : `${b.guests.length} ${b.guests.length === 1 ? 'guest' : 'guests'}: ${b.guests.map(g => g.name).join(', ')}`}{b.quiet ? ' · quiet hours' : ''}</p>
              {c.canCancel && (askCancel === b.id ? (
                <div className="space-y-2">
                  <p className="text-base text-br-dk-sub">{c.line}</p>
                  <div className="flex gap-3">
                    <button type="button" disabled={busy} onClick={() => cancel(b.id)} className="rounded-lg bg-br-red text-white text-base font-semibold px-4 min-h-11">Cancel booking</button>
                    <button type="button" onClick={() => setAskCancel('')} className="text-base text-br-dk-sub px-2 min-h-11">Keep it</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => setAskCancel(b.id)} className="rounded-lg border border-br-red text-br-red text-base font-semibold px-4 min-h-11">Cancel</button>
                  <span className="text-base text-br-dk-sub">{c.line}</span>
                </div>
              ))}
            </div>
          )
        })}
      </section>

      <section id="recordings" aria-label="My recordings" className="space-y-3">
        <h3 className="font-display text-br-dk-text text-lg tracking-widest">My recordings</h3>
        {recs && recs.length === 0 && <p className="text-base text-br-dk-sub">Recordings you make on the studio computer show up here.</p>}
        {recs?.map(r => (
          <div key={r.id} className="sk-field rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-base text-br-dk-text">{r.title || 'Untitled recording'}</p>
              <p className="text-base text-br-dk-sub">{recordingWord(r.status)}{r.durationSec ? ` · ${mmss(r.durationSec)}` : ''}</p>
            </div>
            {canSchedule(r.status) && <Link href={`/slots?type=prerecorded&recording=${r.id}`} className="text-base text-br-gold underline underline-offset-4">Schedule this to air</Link>}
            {(r.status === 'uploaded' || r.status === 'attached') && <button type="button" onClick={() => removeRec(r.id)} className="text-base text-br-dk-sub underline min-h-11 px-2">Delete</button>}
          </div>
        ))}
      </section>
    </div>
  )
}
