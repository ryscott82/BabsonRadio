'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, signOut } from '@/lib/auth'
import { QUIET_BANNER, adBreak, bookingLines, quietBanner, type AdPlan, type LevelState, type StudioStatus } from '@/lib/booth'
import { errText, helper, isNight, loadPref, mmss, savePref, type Butt, type Track } from '@/components/booth/helper'
import IdleScreen, { exitPanel } from '@/components/booth/IdleScreen'
import { useInputMeter } from '@/components/booth/useInputMeter'
import LevelMeter from '@/components/booth/LevelMeter'
import DeviceSettings, { type Devices } from '@/components/booth/DeviceSettings'
import MusicPlayer from '@/components/booth/MusicPlayer'
import Soundboard from '@/components/booth/Soundboard'
import ClockScreen from '@/components/booth/ClockScreen'
import EmojiGlyph from '@/components/EmojiGlyph'
import { useAutoGain } from '@/components/booth/useAutoGain'
import { useListeners } from '@/components/booth/useListeners'
import NoteBox from '@/components/booth/NoteBox'
import RecordShow, { useRecState } from '@/components/booth/RecordShow'
import { useStudioStatus } from '@/components/booth/useStudioStatus'

// Studio PC kiosk (Chrome --kiosk on babsonradio.com/booth): glass screens on the oak desk. Top: the show and its time left,
// and the level (with auto level). Bottom: the big Go live / End show button (or Record a show), tracks, and the sound board.
// Above it all: the quiet-hours banner and who has the studio booked (information only: walk-ins always work, nothing is ever blocked).
// Talks to the studio helper on 127.0.0.1 (tools/studio-helper), which drives BUTT. Only works on the studio PC.

interface Show { title: string; occId: string; startAt: number; endAt: number }
interface Session {
  sessionId: string; name: string; firstName: string; level: string; canGoLive: boolean; canRecord?: boolean; reason: string
  show: Show | null; nextShow: Show | null; token: string; tokenExp: number
  ads: AdPlan; note: { text: string; by: string; at: number } | null
  next: { title: string; hosts: string[]; startAt: number } | null
}

const IDLE_MS = 10 * 60_000
const REFRESH_MS = 4 * 60_000
const DEAD_AIR_S = 10

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function BoothPage() {
  const { user, loading } = useAuth()
  const [helperUp, setHelperUp] = useState<boolean | null>(null)
  const [butt, setButt] = useState<Butt | null>(null)
  const [buttErr, setButtErr] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [exited, setExited] = useState(false)
  const buttRef = useRef<Butt | null>(null)
  const errSince = useRef(0)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  useEffect(() => { buttRef.current = butt }, [butt])

  // Helper and BUTT status, every 2 seconds, signed in or not. BUTT is slow to answer (it takes a few seconds after it starts or after a
  // command), so "BUTT isn’t answering" only shows after it has been silent for 10 seconds in a row.
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try { await helper('/ping'); if (!stop) setHelperUp(true) } catch { if (!stop) { setHelperUp(false); setButt(null) } return }
      try { const b = await helper<Butt>('/status'); if (!stop) { setButt(b); setButtErr(''); errSince.current = 0 } }
      catch (e) {
        if (stop) return
        errSince.current ||= Date.now()
        if (Date.now() - errSince.current >= 10_000) { setButt(null); setButtErr(errText(e)) }
      }
    }
    tick()
    const t = setInterval(tick, 2_000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  const leavePanel = async () => {
    setExited(true)
    try { await exitPanel() } catch { setExited(false) }
  }

  return (
    <>
      {/* Pure black from 7 pm to 7 am, over the oak desk. */}
      {isNight(now) && <div className="fixed inset-0 z-[1] bg-black" aria-hidden />}
      <div className={`relative z-[2] -mt-16 -mb-12 min-h-dvh px-8 py-6 text-lg ${isNight(now) ? 'booth-night' : ''}`}>
        {exited ? (
          <Center title="Booth panel closed" text="The panel comes back by itself in about 30 minutes." />
        ) : helperUp === false ? (
          <Center title="The studio helper isn’t running" text="Open “start-helper” on this computer and wait a few seconds." />
        ) : loading ? null : !user ? (
          <IdleScreen onExitPanel={leavePanel} />
        ) : (
          <Console butt={butt} buttRef={buttRef} buttErr={buttErr} key={user.uid} onExitPanel={leavePanel} />
        )}
      </div>
    </>
  )
}

function Center({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-[80dvh] grid place-items-center">
      <div className="hw-screen max-w-2xl w-full text-center space-y-4 p-10">
        <h1 className="hw-title text-5xl">{title}</h1>
        {text && <p className="text-2xl lbl">{text}</p>}
        {children}
      </div>
    </div>
  )
}

function Console({ butt, buttRef, buttErr, onExitPanel }: { butt: Butt | null; buttRef: React.MutableRefObject<Butt | null>; buttErr: string; onExitPanel: () => void }) {
  const { isGuest, user } = useAuth()
  const [s, setS] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)
  const [devices, setDevices] = useState<Devices>(() => ({ input: loadPref('input'), music: loadPref('music') }))
  const [modal, setModal] = useState<'' | 'sound' | 'note'>('')
  const [idCue, setIdCue] = useState(0)
  const [adCue, setAdCue] = useState(0)
  const [lastMusicAt, setLastMusicAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const sessionRef = useRef<Session | null>(null)
  const lastActive = useRef(0)
  const live = !!butt?.connected
  const connecting = !!butt?.connecting
  const gainRef = useRef(0)
  const meter = useInputMeter(devices.input, !isGuest, `${live ? 1 : 0}:${lastMusicAt}`, gainRef)
  const audience = useListeners()
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5_000); return () => clearInterval(t) }, [])

  const changeDevices = (d: Devices) => { setDevices(d); savePref('input', d.input); savePref('music', d.music) }

  const refresh = useCallback(async () => {
    const nonce = `${Date.now()}.${crypto.getRandomValues(new Uint32Array(3)).join('').slice(0, 24)}`
    const { sig } = await helper<{ sig: string }>(`/attest?nonce=${encodeURIComponent(nonce)}`)
    const r = await api<Session>('/api/booth/session', { nonce, sig, sessionId: sessionRef.current?.sessionId ?? '' })
    sessionRef.current = r
    setS(r)
    return r
  }, [])

  useEffect(() => {
    if (isGuest) return
    const run = () => refresh().then(() => setError('')).catch(e => setError(errText(e)))
    run()
    const t = setInterval(run, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh, isGuest])

  /** A control token good for at least another minute (stable, so the players don't reload when it refreshes). */
  const token = useCallback(async () => {
    const cur = sessionRef.current
    return (cur && cur.tokenExp - Date.now() > 60_000 ? cur : await refresh()).token
  }, [refresh])
  const auto = useAutoGain(meter.frame, token)
  useEffect(() => { gainRef.current = auto.on ? auto.db : 0 }, [auto.on, auto.db])
  const studio = useStudioStatus(!isGuest)
  const rec = useRecState(token)
  const recording = !!rec.st && rec.st.recorder.state !== 'idle'
  const [mode, setMode] = useState<'live' | 'record'>('live')
  const shownMode = live || connecting ? 'live' : recording ? 'record' : mode

  const report = useCallback((kind: string, extra: Record<string, unknown> = {}) => {
    const id = sessionRef.current?.sessionId
    return id ? api('/api/booth/event', { sessionId: id, kind, ...extra }) : Promise.resolve()
  }, [])

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError('')
    try { await fn() } catch (e) { setError(errText(e)) } finally { setBusy('') }
  }

  // Going live also starts BUTT's recording; ending stops it (the helper does both).
  /** BUTT takes a moment to answer: wait up to 6 seconds (checking every half second) for its status to match, before the page decides anything. */
  const waitButt = async (want: (b: Butt) => boolean) => {
    for (let i = 0; i < 12; i++) { const b = buttRef.current; if (b && want(b)) return; await new Promise(r => setTimeout(r, 500)) }
  }
  const goLive = () => act('live', async () => {
    await helper('/live/start', { token: await token() })
    await waitButt(b => b.connected || b.connecting)
    setLastMusicAt(Date.now())
    await report('live_start').catch(() => {})
  })
  const endShow = () => act('stop', async () => {
    await helper('/live/stop', { token: await token() })
    await waitButt(b => !b.connected && !b.connecting)
    await report('live_stop').catch(() => {})
  })

  const onAired = useCallback((t: Track) => {
    if (!t.bed) setLastMusicAt(Date.now())
    report('music', { title: t.title, artist: t.artist }).catch(() => {})
  }, [report])

  const leave = useCallback(async (kind: 'sign_out' | 'idle_out') => {
    await report(kind).catch(() => {})
    sessionRef.current = null
    await signOut()
  }, [report])
  const signOutNow = () => act('out', async () => {
    if (live || connecting) {
      await helper('/live/stop', { token: await token() })
      await report('live_stop').catch(() => {})
    }
    // A recording is stopped and kept on this PC; it shows as "Not saved yet" next time they sign in.
    if (recording) await helper('/record/stop', { token: await token() }).catch(() => {})
    await leave('sign_out')
  })

  // Sign out by itself after 10 quiet minutes (with a 60 second "Still there?" first), but never while on air or recording.
  const [stillThere, setStillThere] = useState(0)
  useEffect(() => {
    const touch = () => { lastActive.current = Date.now(); setStillThere(0) }
    if (!lastActive.current) lastActive.current = Date.now()
    const evs = ['pointerdown', 'keydown'] as const
    evs.forEach(e => window.addEventListener(e, touch))
    const t = setInterval(() => {
      const quiet = Date.now() - lastActive.current
      if (live || connecting || recording) { setStillThere(0); return }
      if (quiet > IDLE_MS) leave('idle_out').catch(() => {})
      else if (quiet > IDLE_MS - 60_000) setStillThere(Math.ceil((IDLE_MS - quiet) / 1000))
    }, 1_000)
    return () => { evs.forEach(e => window.removeEventListener(e, touch)); clearInterval(t) }
  }, [live, connecting, recording, leave])
  useEffect(() => { if (live || recording) lastActive.current = Date.now() }, [live, recording])

  if (isGuest) {
    return (
      <Center title="Students only" text="Going live is for Babson, Olin and Wellesley students.">
        <button type="button" onClick={() => signOut()} className="gbtn h-16 px-10 text-2xl">Sign out</button>
      </Center>
    )
  }

  // Dead air: the meter hears nothing (or BUTT says so when the meter is off) for 10 seconds while on air.
  const silentFor = meter.stats.on ? meter.stats.silentFor : butt?.silence ? DEAD_AIR_S : 0
  const deadAir = live && silentFor >= DEAD_AIR_S ? Math.floor(silentFor) : 0
  const ready = !!butt && !buttErr
  const problem = error || (buttErr ? 'BUTT isn’t answering. Open BUTT on this computer.' : '')
  const top = Object.entries(audience?.recentReactions ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const hb = 'gbtn h-14 px-5 text-xl'

  return (
    <div className="flex flex-col gap-6 xl:h-[calc(100dvh-3rem)]">
      <StudioNotices status={studio.status} myBookingId={studio.myBookingId} />
      <header className="flex items-center gap-6">
        <div className="min-w-0 flex-1 hw-desk-text">
          <h1 className="hw-title text-6xl leading-none truncate">Welcome, {s?.firstName || '…'}</h1>
          <p className={`text-2xl mt-2 truncate ${problem ? 'text-[#FFB3A6]' : ''}`}>
            {problem || (s?.note ? `Note from ${s.note.by || 'the last host'}: ${s.note.text}` : '')}
          </p>
        </div>
        {audience && (
          <div className="hw-desk-text flex items-center gap-3 text-2xl shrink-0">
            <span><span className="hw-title text-4xl tabular-nums">{audience.listeners}</span> listening</span>
            {top.map(([e, n]) => <span key={e} className="flex items-center gap-1"><EmojiGlyph e={e} size={26} />{n}</span>)}
          </div>
        )}
        <div className="hw-sign shrink-0" style={{ position: 'relative', left: 0, top: 0 }}>
          <span style={live ? undefined : { color: '#4a2620', textShadow: 'none' }}>ON AIR</span>
        </div>
        <p className="hw-desk-text hw-title text-5xl tabular-nums shrink-0">{clock(now)}</p>
        <button type="button" className={hb} onClick={() => setModal('note')}>Leave a note</button>
        <button type="button" className={hb} onClick={() => setModal('sound')}>Audio setup</button>
        {!live && !connecting && !recording && <button type="button" className={hb} onClick={onExitPanel}>Exit panel</button>}
        {confirmOut ? (
          <>
            <button type="button" className={hb} onClick={() => setConfirmOut(false)}>Stay</button>
            <button type="button" className={`${hb} gbtn-stop`} onClick={signOutNow} disabled={!!busy}>{live ? 'End show and sign out' : 'Stop recording and sign out'}</button>
          </>
        ) : (
          <button type="button" className={hb} onClick={() => (live || recording ? setConfirmOut(true) : signOutNow())} disabled={!!busy}>Sign out</button>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-2 xl:h-[46%] shrink-0">
        <ClockScreen show={s?.show ?? null} next={s?.next ?? null} ads={s?.ads ?? null} live={live}
                     onAirSeconds={butt?.streamSeconds ?? 0} lastMusicAt={lastMusicAt} onPlayId={() => setIdCue(n => n + 1)} />
        <LevelMeter frame={meter.frame} stats={meter.stats} error={meter.error} deadAir={deadAir} auto={auto} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.75fr_1fr] min-h-0 flex-1">
        <div className="hw-screen p-6 flex flex-col gap-4 min-h-0">
          {!live && !connecting && !recording && (
            <div className="flex gap-2" role="group" aria-label="Mode">
              <button type="button" className="gbtn h-12 flex-1 text-xl" aria-pressed={shownMode === 'live'} onClick={() => setMode('live')}>Go live</button>
              <button type="button" className="gbtn h-12 flex-1 text-xl" aria-pressed={shownMode === 'record'} onClick={() => setMode('record')}>Record a show</button>
            </div>
          )}
          <div className="flex-1 min-h-0">
            {shownMode === 'live' ? (
              <GoLive live={live} connecting={connecting} recording={!!butt?.recording} onAirSeconds={butt?.streamSeconds ?? 0}
                      canGoLive={!!s?.canGoLive} reason={s?.reason ?? ''} ready={ready} busy={busy}
                      level={meter.stats.state} ads={s?.ads ?? null} onGoLive={goLive} onEnd={endShow} onPlayAds={() => setAdCue(n => n + 1)} />
            ) : (
              <RecordShow st={rec.st} reload={rec.reload} getToken={token} live={live || connecting} ready={ready} level={meter.stats.state} myUid={user?.uid ?? ''} />
            )}
          </div>
        </div>
        <div className="hw-screen p-6 min-h-0">
          <MusicPlayer getToken={token} live={live} output={devices.music} idCue={idCue} adCue={adCue} onAired={onAired} />
        </div>
        <div className="hw-screen p-6 min-h-0">
          <Soundboard getToken={token} output={devices.music} />
        </div>
      </div>

      {stillThere > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80" role="alertdialog" aria-label="Still there?">
          <div className="hw-screen p-12 text-center space-y-5">
            <p className="hw-title text-6xl">Still there?</p>
            <p className="text-3xl lbl">Signing out in {stillThere} seconds. Touch anything to stay.</p>
          </div>
        </div>
      )}
      {modal === 'sound' && <DeviceSettings value={devices} onChange={changeDevices} refresh={meter.devicesChanged} onClose={() => setModal('')} />}
      {modal === 'note' && s && <NoteBox sessionId={s.sessionId} onClose={() => setModal('')} />}
    </div>
  )
}

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The quiet-hours banner (from 15 minutes before, with a countdown) and who has the studio booked. Warnings only. */
function StudioNotices({ status, myBookingId }: { status: StudioStatus | null; myBookingId: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const q = quietBanner(status, now)
  const lines = bookingLines(status, myBookingId, now, fmtClock)
  if (!q && !lines.length) return null
  return (
    <div className="flex items-center gap-6 flex-wrap">
      {q && (
        <div className="hw-screen px-6 py-3 flex-1 min-w-[40%]" role="status">
          <p className="hw-title text-3xl warn">
            {q.kind === 'soon' ? `Quiet hours start in ${mmss(q.inMs / 1000)}. Keep the volume as low as possible. No loud DJ sets.` : QUIET_BANNER}
          </p>
          {q.kind === 'on' && q.until && <p className="lbl text-lg">Until {fmtClock(q.until)}.</p>}
        </div>
      )}
      {lines.length > 0 && <p className="hw-desk-text text-2xl">{lines.join(' · ')}</p>}
    </div>
  )
}

/** The big button. Off air: three quick ticks (the mic check ticks itself after 3 seconds of Good), then Go live.
 *  On air: End show, with the time on air and whether BUTT is recording. */
function GoLive(p: {
  live: boolean; connecting: boolean; recording: boolean; onAirSeconds: number
  canGoLive: boolean; reason: string; ready: boolean; busy: string; level: LevelState
  ads: AdPlan | null; onGoLive: () => void; onEnd: () => void; onPlayAds: () => void
}) {
  const [phone, setPhone] = useState(false)
  const [clean, setClean] = useState(false)
  const [soundOk, setSoundOk] = useState(false)
  const goodSince = useRef(0)
  useEffect(() => {
    if (soundOk) return
    const t = setInterval(() => {
      if (p.level !== 'good') { goodSince.current = 0; return }
      goodSince.current ||= Date.now()
      if (Date.now() - goodSince.current >= 3000) setSoundOk(true)
    }, 250)
    return () => clearInterval(t)
  }, [p.level, soundOk])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const ad = p.ads ? adBreak(p.ads, now) : null

  if (p.live || p.connecting) {
    return (
      <div className="h-full flex flex-col gap-4">
        {ad?.now && <button type="button" className="gbtn h-16 text-2xl" onClick={p.onPlayAds}>Play the ads</button>}
        <button type="button" onClick={p.onEnd} disabled={!!p.busy} className="gbtn gbtn-stop flex-1 min-h-40 flex flex-col items-center justify-center gap-2">
          <span className="hw-title text-6xl">{p.busy === 'stop' ? 'Ending…' : 'End show'}</span>
          <span className="text-2xl opacity-90">{p.connecting ? 'Connecting…' : `On air ${mmss(p.onAirSeconds)}${p.recording ? ' · recording' : ''}`}</span>
        </button>
      </div>
    )
  }
  const chip = 'gbtn h-12 px-2 text-lg flex-1 whitespace-nowrap'
  const ok = soundOk && phone && clean
  return (
    <div className="h-full flex flex-col gap-4">
      {p.canGoLive ? (
        <div className="flex gap-2">
          <button type="button" className={chip} aria-pressed={soundOk} onClick={() => setSoundOk(x => !x)}>{soundOk ? '✓ ' : ''}Mic check</button>
          <button type="button" className={chip} aria-pressed={phone} onClick={() => setPhone(x => !x)}>{phone ? '✓ ' : ''}Phone silent</button>
          <button type="button" className={chip} aria-pressed={clean} onClick={() => setClean(x => !x)}>{clean ? '✓ ' : ''}Clean music</button>
        </div>
      ) : <p className="lbl text-xl min-h-12 flex items-center">{p.reason}</p>}
      <button type="button" onClick={p.onGoLive} disabled={!!p.busy || !p.canGoLive || !p.ready || !ok}
              className="gbtn gbtn-go flex-1 min-h-40 flex flex-col items-center justify-center gap-2">
        <span className="hw-title text-6xl">{p.busy === 'live' ? 'Going live…' : 'Go live'}</span>
        <span className="text-2xl opacity-90">{!p.canGoLive ? 'Not available yet' : ok ? 'Starts the stream and the recording' : 'Tick all three first'}</span>
      </button>
    </div>
  )
}
