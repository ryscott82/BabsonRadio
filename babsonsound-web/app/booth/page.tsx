'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, signOut } from '@/lib/auth'
import { countdownText, heroMode, idleStep, quietReminderDue, MIXING_HOLD_MS, MIXING_PEAK_DBFS, MIXING_SNOOZE_MS, adBreak, bookingLines, quietBanner, type AdPlan, type LevelState, type StudioStatus } from '@/lib/booth'
import { boothFetch, errText, helper, loadPref, mmss, savePref, type Butt, type Track } from '@/components/booth/helper'
import DoorClaim from '@/components/booth/DoorClaim'
import CrewPanel from '@/components/booth/CrewPanel'
import type { CrewPerson } from '@/lib/crew'
import { openSignIn } from '@/lib/signInPrompt'
import IdleScreen, { exitPanel } from '@/components/booth/IdleScreen'
import { useInputMeter } from '@/components/booth/useInputMeter'
import LevelMeter from '@/components/booth/LevelMeter'
import DeviceSettings, { type Devices } from '@/components/booth/DeviceSettings'
import MusicPlayer from '@/components/booth/MusicPlayer'
import Soundboard from '@/components/booth/Soundboard'
import ClockScreen from '@/components/booth/ClockScreen'
import { useAutoGain } from '@/components/booth/useAutoGain'
import CheckButton, { useMicCheck } from '@/components/booth/CheckButton'
import { useShowInfo } from '@/components/booth/useShowInfo'
import { BROWSER_ACTIVE_MS, BrowserButtons, closeBrowser, setBrowserLayout, type BrowserState } from '@/components/booth/StudioBrowser'
import NoteBox from '@/components/booth/NoteBox'
import ShowInfo from '@/components/booth/ShowInfo'
import RecordShow, { useRecState } from '@/components/booth/RecordShow'
import { useBoothTheme } from '@/components/booth/useBoothTheme'
import { useStudioStatus } from '@/components/booth/useStudioStatus'

// Studio PC kiosk (Chrome --kiosk on babsonradio.com/booth): glass screens on the oak desk. Top: the show and its time left,
// and the level (with auto level). Bottom: the big Go live / End show button (or Record a show), tracks, and the sound board.
// Above it all: the quiet-hours banner and who has the studio booked (information only: walk-ins always work, nothing is ever blocked).
// Talks to the studio helper on 127.0.0.1 (tools/studio-helper), which drives BUTT. Only works on the studio PC.

interface Show { title: string; occId: string; startAt: number; endAt: number }
interface Session {
  sessionId: string; name: string; firstName: string; level: string; canGoLive: boolean; canRecord?: boolean; reason: string
  show: Show | null; nextShow: Show | null; token: string; tokenExp: number; crew?: CrewPerson[]
  ads: AdPlan; note: { text: string; by: string; at: number } | null
  next: { title: string; hosts: string[]; startAt: number } | null
  signInToLive?: boolean
  /** The signed-in person's role (member, host, eboard, admin). Only admin and eboard (director) see Exit panel. */
  role?: string
}

/** When this person signed in, kept in the tab so the console can remount (helper blip, auth refresh) without restarting the welcome. */
function signedInAt(key: string): number {
  try {
    const k = `booth-since:${key}`, v = Number(sessionStorage.getItem(k))
    if (v > 0) return v
    const t = Date.now(); sessionStorage.setItem(k, String(t)); return t
  } catch { return Date.now() }
}
function forgetSignIns() { try { Object.keys(sessionStorage).filter(k => k.startsWith('booth-since:')).forEach(k => sessionStorage.removeItem(k)) } catch { /* ignore */ } }

const REFRESH_MS = 4 * 60_000
const DEAD_AIR_S = 10

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function BoothPage() {
  const { user, loading } = useAuth()
  const [helperUp, setHelperUp] = useState<boolean | null>(null)
  const [butt, setButt] = useState<Butt | null>(null)
  const [buttErr, setButtErr] = useState('')
  const [browserSt, setBrowserSt] = useState<BrowserState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [exited, setExited] = useState(false)
  const [bypass, setBypass] = useState<{ pin: string; session: Session } | null>(null)
  const [wantLive, setWantLive] = useState(false)   // someone pressed Go live with nobody signed in: go live by itself once they have signed in
  const [snoozeUntil, setSnoozeUntil] = useState(0) // after leaving the booth, audio does not reopen it for a few minutes
  const [idleInput] = useState(() => loadPref('input'))
  const idleGain = useRef(0)
  const theme = useBoothTheme(now)

  // Idle screen: if the studio input carries sound for a few seconds, someone is mixing. Open the booth (no sign in needed to look around).
  const watching = helperUp === true && !loading && !user && !bypass && !exited && now >= snoozeUntil
  const idleMeter = useInputMeter(idleInput, watching, 'idle', idleGain)
  const loudSince = useRef(0), opening = useRef(false)
  useEffect(() => {
    const st = idleMeter.stats
    if (!watching || !st.on || !(st.peak > MIXING_PEAK_DBFS)) { loudSince.current = 0; return }
    loudSince.current ||= Date.now()
    if (Date.now() - loudSince.current < MIXING_HOLD_MS || opening.current) return
    opening.current = true
    boothFetch<Session>('/api/booth/bypass', { pin: '' }).then(session => setBypass({ pin: '', session })).catch(() => {}).finally(() => { opening.current = false })
  }, [idleMeter.stats, watching])
  const buttRef = useRef<Butt | null>(null)
  const errSince = useRef(0)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  useEffect(() => { buttRef.current = butt }, [butt])
  useEffect(() => { if (user) queueMicrotask(() => setBypass(null)) }, [user])

  // Helper and BUTT status, every 2 seconds, signed in or not. BUTT is slow to answer (it takes a few seconds after it starts or after a
  // command), so "BUTT isn’t answering" only shows after it has been silent for 10 seconds in a row.
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try { const p = await helper<{ browser?: BrowserState }>('/ping'); if (!stop) { setHelperUp(true); setBrowserSt(p.browser ?? null) } } catch { if (!stop) { setHelperUp(false); setButt(null) } return }
      try { const b = await helper<Butt>('/status'); if (!stop) { setButt(b); setButtErr(''); errSince.current = 0; savePref('studioPc', '1') } }
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

  // Back on the idle screen (nobody signed in): a studio browser left open is closed. Its sign-ins stay in its own profile.
  const signedOut = helperUp === true && !loading && !user && !bypass
  useEffect(() => { if (signedOut && browserSt?.open) closeBrowser().catch(() => {}) }, [signedOut, browserSt?.open])
  useEffect(() => { if (signedOut) forgetSignIns() }, [signedOut])

  const leavePanel = async () => {
    setExited(true)
    try { await exitPanel() } catch { setExited(false) }
  }

  return (
    <>
      {/* Pure black from 7 pm to 7 am, over the oak desk. */}
      {theme.night && <div className="fixed inset-0 z-[1] bg-black" aria-hidden />}
      <div className={`relative z-[2] -mt-16 -mb-12 min-h-dvh px-8 py-6 text-lg ${theme.night ? 'booth-night' : ''}`}>
        {exited ? (
          <Center title="Booth panel closed" text="The panel comes back by itself in about 30 minutes." />
        ) : helperUp === false ? (
          <Center title="The studio helper isn’t running" text="Open “start-helper” on this computer and wait a few seconds." />
        ) : loading ? null : !user && !bypass ? (
          <IdleScreen onBypass={(pin, session) => setBypass({ pin, session: session as Session })} />
        ) : (
          <Console butt={butt} buttRef={buttRef} buttErr={buttErr} browserSt={browserSt} key={user?.uid ?? 'bypass'} onExitPanel={leavePanel}
                   bypass={user ? null : bypass} onBypassEnd={() => { setBypass(null); setWantLive(false); setSnoozeUntil(Date.now() + MIXING_SNOOZE_MS) }}
                   autoLive={wantLive} onWantLive={setWantLive} onUnlock={pin => setBypass(b => (b ? { ...b, pin } : b))} />
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

function Console({ butt, buttRef, buttErr, browserSt, onExitPanel, bypass, onBypassEnd, autoLive, onWantLive, onUnlock }: { butt: Butt | null; buttRef: React.MutableRefObject<Butt | null>; buttErr: string; browserSt: BrowserState | null; onExitPanel: () => void; bypass: { pin: string; session: Session } | null; onBypassEnd: () => void; autoLive: boolean; onWantLive: (v: boolean) => void; onUnlock: (pin: string) => void }) {
  const { isGuest, user } = useAuth()
  const [s, setS] = useState<Session | null>(bypass?.session ?? null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)
  const [devices, setDevices] = useState<Devices>(() => ({ input: loadPref('input'), music: loadPref('music') }))
  const [modal, setModal] = useState<'' | 'sound' | 'note' | 'show'>('')
  const [signInOpen, setSignInOpen] = useState(false)
  const [nowTrack, setNowTrack] = useState<Track | null>(null)
  const nowTrackRef = useRef<Track | null>(null)
  useEffect(() => { nowTrackRef.current = nowTrack }, [nowTrack])
  const [since] = useState(() => signedInAt(user?.uid ?? 'bypass'))
  const [trackText, setTrackText] = useState<string | null>(null) // typed track title; null follows what is playing
  const [hostsText, setHostsText] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState('')
  const [idCue, setIdCue] = useState(0)
  const [adCue, setAdCue] = useState(0)
  const [lastMusicAt, setLastMusicAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const sessionRef = useRef<Session | null>(bypass?.session ?? null)
  const lastActive = useRef(0)
  const live = !!butt?.connected
  const connecting = !!butt?.connecting
  const gainRef = useRef(0)
  useEffect(() => {
    const html = document.documentElement, prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = prev }
  }, [])
  const meter = useInputMeter(devices.input, !isGuest, `${live ? 1 : 0}:${lastMusicAt}`, gainRef)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5_000); return () => clearInterval(t) }, [])

  const changeDevices = (d: Devices) => { setDevices(d); savePref('input', d.input); savePref('music', d.music) }

  const refresh = useCallback(async () => {
    const nonce = `${Date.now()}.${crypto.getRandomValues(new Uint32Array(3)).join('').slice(0, 24)}`
    const { sig } = await helper<{ sig: string }>(`/attest?nonce=${encodeURIComponent(nonce)}`)
    const sid = sessionRef.current?.sessionId ?? ''
    const r = bypass ? await boothFetch<Session>('/api/booth/bypass', { pin: bypass.pin, sessionId: sid })
                     : await api<Session>('/api/booth/session', { nonce, sig, sessionId: sid })
    sessionRef.current = r
    setS(r)
    return r
  }, [bypass])

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
  /** Emergency PIN, from the Go live sign-in card: the same no-sign-in session, now allowed to go live. */
  const unlock = async () => {
    setPinBusy(true); setPinError('')
    try {
      const r = await boothFetch<Session>('/api/booth/bypass', { pin: pin.trim(), sessionId: sessionRef.current?.sessionId ?? '' })
      sessionRef.current = r; setS(r); onUnlock(pin.trim()); setSignInOpen(false); setPin('')
    } catch (e) { setPinError(errText(e)) } finally { setPinBusy(false) }
  }
  const info = useShowInfo(token, !!s)
  const auto = useAutoGain(meter.frame, token)
  useEffect(() => { gainRef.current = auto.on ? auto.db : 0 }, [auto.on, auto.db])
  const studio = useStudioStatus(!isGuest, !!bypass)
  const rec = useRecState(token)
  const recording = !!rec.st && rec.st.recorder.state !== 'idle'
  const [mode, setMode] = useState<'live' | 'record'>('live')
  const shownMode = bypass || live || connecting ? 'live' : recording ? 'record' : mode

  const report = useCallback((kind: string, extra: Record<string, unknown> = {}) => {
    const id = sessionRef.current?.sessionId
    if (!id) return Promise.resolve()
    return bypass ? boothFetch('/api/booth/event', { sessionId: id, kind, ...extra }) : api('/api/booth/event', { sessionId: id, kind, ...extra })
  }, [bypass])

  // Quiet hours: when someone is signed in during quiet hours they must tap OK, and the tap is logged on their session (once per quiet stretch).
  const quietNow = quietBanner(studio.status, now)
  const quietKey = quietNow?.kind === 'on' ? String(quietNow.until ?? 'on') : ''
  const [quietAck, setQuietAck] = useState('')
  const ackQuiet = () => { setQuietAck(quietKey); report('quiet_ack').catch(() => {}) }

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
    // Nobody has named the show yet: open Show info so the archive gets a proper title and contributors (it can be changed during the show).
    helper<{ title: string }>('/show/get', { token: await token() }).then(sh => { if (!sh.title) setModal('show') }).catch(() => {})
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
    await closeBrowser().catch(() => {}) // the window closes; its sign-ins stay in the studio browser's own profile
    await report(kind).catch(() => {})
    sessionRef.current = null
    if (bypass) onBypassEnd(); else await signOut()
  }, [report, bypass, onBypassEnd])
  const signOutNow = () => act('out', async () => {
    if (live || connecting) {
      await helper('/live/stop', { token: await token() })
      await report('live_stop').catch(() => {})
    }
    // A recording is stopped and kept on this PC; it shows as "Not saved yet" next time they sign in.
    if (recording) await helper('/record/stop', { token: await token() }).catch(() => {})
    await leave('sign_out')
  })

  // Sign out by itself after 30 minutes with no touch, no sound on the input and no music (with a 60 second "Are you still using the studio?" first),
  // but never while on air or recording.
  const [stillThere, setStillThere] = useState(0)
  const browserRef = useRef<BrowserState | null>(null)
  useEffect(() => { browserRef.current = browserSt }, [browserSt])
  useEffect(() => {
    const touch = () => { lastActive.current = Date.now(); setStillThere(0) }
    if (!lastActive.current) lastActive.current = Date.now()
    const evs = ['pointerdown', 'keydown'] as const
    evs.forEach(e => window.addEventListener(e, touch))
    const t = setInterval(() => {
      const quiet = Date.now() - lastActive.current
      if (live || connecting || recording) { setStillThere(0); return }
      if (nowTrackRef.current) { lastActive.current = Date.now(); setStillThere(0); return } // music is playing: someone is using it
      const br = browserRef.current
      if (br?.open && Date.now() - (br.since ?? Date.now()) < BROWSER_ACTIVE_MS) { lastActive.current = Date.now(); setStillThere(0); return } // using the studio browser
      const st = idleStep(quiet)
      if (st.out) leave('idle_out').catch(() => {})
      else setStillThere(st.warn ? st.secondsLeft : 0)
    }, 1_000)
    return () => { evs.forEach(e => window.removeEventListener(e, touch)); clearInterval(t) }
  }, [live, connecting, recording, leave])
  useEffect(() => { if (live || recording) lastActive.current = Date.now() }, [live, recording])
  // Sound on the input counts as someone being there.
  useEffect(() => { if (meter.stats.on && meter.stats.state !== 'silent') lastActive.current = Date.now() }, [meter.stats])
  useEffect(() => { queueMicrotask(() => setTrackText(null)) }, [nowTrack])
  // They pressed Go live before signing in: once signed in and the session is loaded, go live right away (or show why not).
  const autoDone = useRef(false)
  useEffect(() => {
    if (!autoLive || bypass || autoDone.current || !s || !butt || buttErr) return
    autoDone.current = true
    if (s.canGoLive && !live && !connecting) queueMicrotask(() => { void goLive() })
    queueMicrotask(() => onWantLive(false))
  })

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
  const sb = 'gbtn h-9 px-3 text-sm'
  const staffRole = s?.role ?? s?.level ?? ''  // the session's role when the server sends one, else the access level (director is the E-board)
  const canExit = !bypass && ['admin', 'eboard', 'director'].includes(staffRole)

  const date = new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  const next = s?.next
  const hero = heroMode({ live, connecting, sinceMs: now - since, nextStartAt: next?.startAt ?? null, now })
  const welcomeBig = hero === 'welcome'
  const countdownBig = hero === 'countdown' && !!next
  const showName = info.show ? info.show.title : s?.show?.title || ''
  const hostsValue = hostsText ?? ((info.show?.hosts.length ? info.show.hosts.join(', ') : '') || (bypass ? '' : s?.name ?? ''))
  const canEditShow = !!s?.canGoLive || !!s?.canRecord || live
  const fieldCls = 'gfield h-10 px-3 text-2xl w-full min-w-0'
  /** A typed track title goes to the site and app while live ("Artist - Title" or just a title). */
  const sendTrack = () => {
    const text = (trackText ?? '').trim()
    if (!text || !live) return
    const [artist, title] = text.includes(' - ') ? [text.split(' - ')[0].trim(), text.split(' - ').slice(1).join(' - ').trim()] : ['', text]
    // The site checks the words (Admin > Blocked words) and signs the title; the helper only puts a signed title on the stream.
    void (async () => {
      try {
        const r = await report('song', { title, artist, text }) as { text?: string; sig?: string } | undefined
        if (r?.sig) await helper('/song', { token: await token(), text: r.text, cleanSig: r.sig })
      } catch (e) { setError(errText(e)) }
    })()
  }
  // Studio browser open: split keeps the left column (the right half is the browser); full leaves a slim rail.
  const bl = browserSt?.open ? browserSt.layout : ''
  const area: React.CSSProperties | undefined = bl === 'split' ? { right: '50%' } : bl === 'full' ? { right: `calc(100% - ${browserSt?.railPx ?? 260}px)` } : undefined
  if (bl === 'full') {
    return (
      <div className="fixed inset-0 z-[2] flex flex-col gap-4 p-4 overflow-hidden hw-desk-text" style={area}>
        <div className={`hw-sign ${bl ? '' : 'hw-sign-lg'} shrink-0`} style={{ position: 'relative', left: 0, top: 0 }}>
          <span style={live ? undefined : { color: '#4a2620', textShadow: 'none' }}>ON AIR</span>
        </div>
        <p className="hw-title text-4xl leading-none tabular-nums">{clock(now)}</p>
        {(live || connecting) && <p className="text-xl">{connecting ? 'Connecting…' : `On air ${mmss(butt?.streamSeconds ?? 0)}`}</p>}
        {deadAir > 0 && <p className="text-xl warn">Dead air {deadAir} s</p>}
        {problem && <p className="text-base warn">{problem}</p>}
        <div className="flex-1" />
        {stillThere > 0 && <button type="button" className="gbtn gbtn-go h-16 text-lg" onClick={() => setStillThere(0)}>Still here? Signing out in {stillThere} s</button>}
        {quietKey && quietAck !== quietKey && <button type="button" className="gbtn h-16 text-base warn" onClick={ackQuiet}>Quiet hours: keep it low. OK</button>}
        <button type="button" className="gbtn h-14 text-lg" onClick={() => void token().then(t => setBrowserLayout(t, 'split')).catch(e => setError(errText(e)))}>Split screen</button>
        <button type="button" className="gbtn h-14 text-lg" onClick={() => void closeBrowser().catch(e => setError(errText(e)))}>Close browser</button>
        {(live || connecting) && <button type="button" className="gbtn gbtn-stop h-20 text-2xl" onClick={endShow} disabled={!!busy}>{busy === 'stop' ? 'Ending…' : 'End show'}</button>}
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-[2] flex flex-col gap-3 px-8 pt-5 pb-6 overflow-hidden" style={area}>
      {/* A slim strip: logo, the on-air light, the show (or what is next), who else is in the studio, the notices, and the time. */}
      <header className={`hw-desk-text flex items-center shrink-0 ${bl ? 'gap-3 min-h-[4rem]' : 'gap-5 min-h-[5.5rem]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/booth/logo.png" alt="Babson Radio" className={`${bl ? 'h-12 w-12' : 'h-20 w-20'} object-contain shrink-0`} />
        <div className="hw-sign shrink-0" style={{ position: 'relative', left: 0, top: 0 }}>
          <span style={live ? undefined : { color: '#4a2620', textShadow: 'none' }}>ON AIR</span>
        </div>
        <p className={`hw-title text-4xl leading-none truncate min-w-0 max-w-[34%] ${bl ? 'hidden' : ''}`}>
          {live && showName ? showName : s?.show ? s.show.title : next ? `Next: ${next.title} at ${clock(next.startAt)}` : 'Nothing booked'}
        </p>
        {!bypass && !bl && <CrewPanel crew={s?.crew ?? []} driverName={s?.name ?? ''} onAir={live || connecting || recording} getToken={token} />}
        <div className={`flex items-center justify-center gap-3 min-w-0 flex-wrap flex-1 ${bl ? 'hidden' : ''}`}>
          <ClockScreen show={s?.show ?? null} ads={s?.ads ?? null} live={live} lastMusicAt={lastMusicAt} onPlayId={() => setIdCue(n => n + 1)} />
          <StudioNotices status={studio.status} myBookingId={studio.myBookingId} />
        </div>
        <div className={`flex items-baseline gap-4 shrink-0 ${bl ? 'ml-auto' : ''}`}>
          <p className="hw-title leading-none tabular-nums" style={{ fontSize: bl ? '3.5rem' : 'clamp(4rem, 8.5vh, 6rem)' }}>{clock(now)}</p>
          <p className={`hw-title leading-none ${bl ? 'text-xl' : 'text-3xl'}`}>{date}</p>
        </div>
      </header>

      {/* The welcome stays 15 minutes after sign-in (and while nothing is booked), then it counts down to the next show. On air it gives way to the show's name. */}
      <div className={`grid items-center gap-4 shrink-0 ${bl ? 'grid-cols-[1fr_auto] min-h-[4.5rem]' : 'grid-cols-[1fr_auto_1fr] gap-6 min-h-[6.5rem]'}`}>
        <div className="flex flex-col items-start gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <BrowserButtons state={browserSt} getToken={token} onError={setError} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!bypass && <button type="button" className={sb} onClick={() => setModal('note')}>Leave a note</button>}
            <button type="button" className={sb} onClick={() => setModal('sound')}>Audio setup</button>
            {canExit && !live && !connecting && !recording && <button type="button" className={sb} onClick={onExitPanel}>Exit panel</button>}
          </div>
        </div>
      {(welcomeBig || countdownBig || problem || s?.note || (live && showName)) ? (
        <div className={`hw-desk-text text-center min-w-0 max-w-[60vw] ${bl ? 'hidden' : ''}`}>
          {welcomeBig ? (
            <h1 className="hw-title leading-none truncate" style={{ fontSize: 'clamp(3rem, 9vh, 6.5rem)' }}>Welcome, {bypass ? 'Babson Sound user' : s?.firstName || '…'}</h1>
          ) : countdownBig && next ? (
            <>
              <h1 className="hw-title leading-none truncate" style={{ fontSize: 'clamp(3rem, 9vh, 6.5rem)' }}>{countdownText(next.startAt - now)}</h1>
              <p className="text-2xl mt-1 truncate">until {next.title}{next.hosts.length ? ` with ${next.hosts.join(', ')}` : ''} at {clock(next.startAt)}</p>
            </>
          ) : live && showName ? (
            <h1 className="hw-title leading-none truncate" style={{ fontSize: 'clamp(2.5rem, 6vh, 4.5rem)' }}>{showName}</h1>
          ) : null}
          {(problem || s?.note) && <p className={`text-xl mt-1 line-clamp-1 ${problem ? 'text-[#FFB3A6]' : ''}`}>{problem || `Note from ${s?.note?.by || 'the last host'}: ${s?.note?.text}`}</p>}
        </div>
      ) : <div />}
        <div className="flex items-center justify-end gap-2">
          {confirmOut ? (
            <>
              <button type="button" className={`gbtn px-6 ${bl ? 'h-16 text-2xl' : 'h-20 text-3xl'}`} onClick={() => setConfirmOut(false)}>Stay</button>
              <button type="button" className={`gbtn gbtn-stop px-6 ${bl ? 'h-16 text-xl' : 'h-20 text-3xl'}`} onClick={signOutNow} disabled={!!busy}>{live ? 'End show and sign out' : 'Stop recording and sign out'}</button>
            </>
          ) : (
            <button type="button" className={`gbtn px-10 ${bl ? 'h-16 text-2xl' : 'h-20 text-3xl'}`} onClick={() => (live || recording ? setConfirmOut(true) : signOutNow())} disabled={!!busy}>{bypass ? 'Back to sign in' : 'Sign out'}</button>
          )}
        </div>
      </div>

      {/* Left: up next, the loudness meter, what is on, Go live. Right: tracks (or the sign-in info) with the sound board under them. */}
      <div className={`grid ${bl ? 'grid-cols-1' : 'grid-cols-[1fr_1.15fr]'} grid-rows-[minmax(0,1fr)] items-stretch gap-5 flex-1 min-h-0`}>
        <div className="flex flex-col gap-3 min-h-0 h-full">
          <div className="bp px-6 py-3 flex-1 min-h-[5.5rem] overflow-hidden flex flex-col justify-center">
            <span className="lbl text-xl">Up next</span>
            {next ? (
              <>
                <p className="hw-title leading-tight line-clamp-2" style={{ fontSize: 'clamp(1.75rem, 4.2vh, 3rem)' }}>{next.title}</p>
                <p className="text-2xl lbl truncate">{next.hosts.length ? `with ${next.hosts.join(', ')} · ` : ''}{clock(next.startAt)}</p>
              </>
            ) : <p className="hw-title text-4xl leading-tight">Nothing booked</p>}
          </div>
          <div className="h-[10.5rem] shrink-0"><LevelMeter frame={meter.frame} stats={meter.stats} error={meter.error} deadAir={deadAir} auto={auto} staff={['admin', 'eboard', 'director'].includes(staffRole)} /></div>
          <div className="bp px-6 py-3 grid grid-cols-[8.5rem_1fr] items-center gap-x-4 gap-y-2 shrink-0">
            <span className="lbl text-lg">Show name</span>
            <input value={showName} onChange={e => info.change({ title: e.target.value })} readOnly={!canEditShow} maxLength={80} placeholder="Name your show"
                   title={canEditShow ? '' : 'Sign in to name the show.'} className={fieldCls} />
            <span className="lbl text-lg">Track title</span>
            <input value={trackText ?? (nowTrack ? `${nowTrack.title}${nowTrack.artist ? ` · ${nowTrack.artist}` : ''}` : '')} placeholder="Nothing playing. Type a track."
                   onChange={e => setTrackText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={sendTrack}
                   title={live ? 'Press Enter to show this on the site and app.' : ''} className={fieldCls} />
            <span className="lbl text-lg">Host name</span>
            <input value={hostsValue} onChange={e => { setHostsText(e.target.value); info.change({ hosts: e.target.value.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean) }) }}
                   readOnly={!canEditShow} placeholder={bypass ? 'Not signed in' : 'Who is on the show'} title={canEditShow ? 'Separate names with commas.' : 'Sign in to edit.'} className={fieldCls} />
            {info.error && <p className="warn text-lg col-span-2">{info.error}</p>}
          </div>
          <div className="bp px-6 py-4 flex flex-col gap-3 shrink-0">
            {!bypass && !live && !connecting && !recording && (
              <div className="flex gap-2" role="group" aria-label="Mode">
                <button type="button" className="gbtn h-10 flex-1 text-base" aria-pressed={shownMode === 'live'} onClick={() => setMode('live')}>Go live</button>
                <button type="button" className="gbtn h-10 flex-1 text-base" aria-pressed={shownMode === 'record'} onClick={() => setMode('record')}>Record a show</button>
              </div>
            )}
            {shownMode === 'live' ? (
              <GoLive live={live} connecting={connecting} recording={!!butt?.recording} onAirSeconds={butt?.streamSeconds ?? 0}
                      canGoLive={!!s?.canGoLive} signInToLive={!!bypass && !!s?.signInToLive} onSignIn={() => { onWantLive(true); setSignInOpen(true) }} reason={s?.reason ?? ''} ready={ready} busy={busy}
                      level={meter.stats.state} ads={s?.ads ?? null} onGoLive={goLive} onEnd={endShow} onPlayAds={() => setAdCue(n => n + 1)} />
            ) : (
              <RecordShow st={rec.st} reload={rec.reload} getToken={token} live={live || connecting} ready={ready} level={meter.stats.state} myUid={user?.uid ?? ''} />
            )}
          </div>
        </div>

        {/* Hidden (not removed) while the browser is open, so a track that is playing keeps playing. */}
        <div className={`bp p-6 flex flex-col gap-3 min-h-0 h-full overflow-hidden ${bl ? 'hidden' : ''}`}>
          {bypass ? <SignInInfo onSignIn={() => openSignIn(false)} /> : (
            <>
              <div className="flex-1 min-h-0">
                <MusicPlayer getToken={token} live={live} output={devices.music} idCue={idCue} adCue={adCue} onAired={onAired} onTrack={setNowTrack} />
              </div>
              <div className="h-32 shrink-0"><Soundboard getToken={token} output={devices.music} /></div>
            </>
          )}
        </div>
      </div>

      {quietKey && quietAck !== quietKey && s && stillThere === 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 px-8" style={area} role="alertdialog" aria-label="Quiet hours">
          <div className="hw-screen max-w-3xl w-full p-12 text-center space-y-6">
            <p className="hw-title text-6xl warn">It’s quiet hours</p>
            <p className="text-3xl">Please don’t make any loud noise. Keep the volume as low as possible, and no loud DJ sets.</p>
            {quietNow?.kind === 'on' && quietNow.until && <p className="text-2xl lbl">Quiet hours end at {fmtClock(quietNow.until)}.</p>}
            <button type="button" className="gbtn gbtn-go h-24 w-full text-4xl" onClick={ackQuiet} autoFocus>OK, I understand</button>
          </div>
        </div>
      )}
      {stillThere > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80" style={area} role="alertdialog" aria-label="Still there?">
          <div className="hw-screen p-12 text-center space-y-5">
            <p className="hw-title text-6xl">Are you still using the studio?</p>
            <p className="text-3xl lbl">Signing out in {stillThere} seconds.</p>
            <button type="button" className="gbtn gbtn-go h-20 px-10 text-3xl" onClick={() => setStillThere(0)} autoFocus>Yes, I’m still here</button>
          </div>
        </div>
      )}
      {bypass && <DoorClaim />}
      {signInOpen && bypass && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 px-8" role="dialog" aria-label="Sign in to go live">
          <div className="hw-screen max-w-4xl w-full p-10 space-y-6">
            <h2 className="hw-title text-5xl leading-none">Sign in to go live</h2>
            <div className="flex items-center gap-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/booth/door-qr.svg" alt="QR code to sign in at the studio" className="h-64 w-64 rounded-xl bg-white shrink-0" />
              <div className="space-y-4 min-w-0 flex-1">
                <p className="text-2xl">Scan the code with your phone. You go live as soon as you are signed in.</p>
                <button type="button" className="gbtn gbtn-go h-20 w-full text-2xl" onClick={() => openSignIn()}>Sign in with Babson Sound account</button>
              </div>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (pin.trim()) void unlock() }} className="space-y-2">
              <p className="text-xl lbl">Sign in down? Emergency access (E-board PIN). The show is logged as “Studio PC (emergency)”.</p>
              <div className="flex gap-3">
                <input aria-label="Emergency PIN" type="password" inputMode="numeric" autoComplete="off" placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} className="gfield h-12 px-4 text-xl w-48" />
                <button type="submit" className="gbtn h-12 px-5 text-lg" disabled={pinBusy || !pin.trim()}>{pinBusy ? 'Checking…' : 'Go live with PIN'}</button>
              </div>
              {pinError && <p className="text-lg warn">{pinError}</p>}
            </form>
            <button type="button" className="gbtn h-12 px-6 text-xl" onClick={() => { setSignInOpen(false); onWantLive(false) }}>Cancel</button>
          </div>
        </div>
      )}
      {modal === 'sound' && <DeviceSettings value={devices} onChange={changeDevices} refresh={meter.devicesChanged} onClose={() => setModal('')} />}
      {modal === 'show' && <ShowInfo getToken={token} live={live || connecting} onClose={() => setModal('')} />}
      {modal === 'note' && s && <NoteBox sessionId={s.sessionId} onClose={() => setModal('')} />}
    </div>
  )
}

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Quiet hours: a small reminder at the top while they are on (dismiss it and it comes back every 30 minutes), and a countdown from 15 minutes
 *  before they start. Also who has the studio booked. Warnings only. */
function StudioNotices({ status, myBookingId }: { status: StudioStatus | null; myBookingId: string }) {
  const [now, setNow] = useState(() => Date.now())
  const [dismissedAt, setDismissedAt] = useState(0)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const q = quietBanner(status, now)
  const lines = bookingLines(status, myBookingId, now, fmtClock)
  const showQuiet = q && (q.kind === 'soon' || quietReminderDue(dismissedAt, now))
  if (!showQuiet && !lines.length) return null
  return (
    <div className="flex items-center gap-6 flex-wrap shrink-0">
      {showQuiet && q && (
        <div className="bp px-5 py-2 flex items-center gap-4 flex-1 min-w-[40%]" role="status">
          <p className="hw-title text-2xl warn">
            {q.kind === 'soon' ? `Quiet hours start in ${mmss(q.inMs / 1000)}. Keep the volume as low as possible. No loud DJ sets.` : 'Reminder: Quiet Hours are in Effect'}
          </p>
          {q.kind === 'on' && q.until && <p className="lbl text-lg">Until {fmtClock(q.until)}</p>}
          {q.kind === 'on' && <button type="button" className="ml-auto text-3xl lbl px-2" aria-label="Dismiss" onClick={() => setDismissedAt(Date.now())}>×</button>}
        </div>
      )}
      {lines.length > 0 && <p className="hw-desk-text text-xl">{lines.join(' · ')}</p>}
    </div>
  )
}

/** The big button. Off air: three quick ticks (the mic check ticks itself after 3 seconds of Good), then Go live.
 *  On air: End show, with the time on air and whether BUTT is recording. */
function GoLive(p: {
  live: boolean; connecting: boolean; recording: boolean; onAirSeconds: number
  canGoLive: boolean; signInToLive: boolean; onSignIn: () => void; reason: string; ready: boolean; busy: string; level: LevelState
  ads: AdPlan | null; onGoLive: () => void; onEnd: () => void; onPlayAds: () => void
}) {
  const [clean, setClean] = useState(false)
  const [soundOk, toggleMic] = useMicCheck(p.level)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const ad = p.ads ? adBreak(p.ads, now) : null

  if (p.live || p.connecting) {
    return (
      <div className="h-full flex flex-col justify-center gap-3">
        {ad?.now && <button type="button" className="gbtn h-16 text-2xl" onClick={p.onPlayAds}>Play the ads</button>}
        <button type="button" onClick={p.onEnd} disabled={!!p.busy} className="gbtn gbtn-stop h-20 flex flex-col items-center justify-center">
          <span className="hw-title text-3xl">{p.busy === 'stop' ? 'Ending…' : 'End show'}</span>
          <span className="text-base opacity-90">{p.connecting ? 'Connecting…' : `On air ${mmss(p.onAirSeconds)}${p.recording ? ' · recording' : ''}`}</span>
        </button>
      </div>
    )
  }
  if (p.signInToLive) {
    return (
      <div className="h-full flex flex-col justify-center gap-3">
        <p className="hw-title text-2xl leading-tight">Mixing? Press Go live, then sign in.</p>
        <button type="button" onClick={p.onSignIn} disabled={!p.ready} className="gbtn gbtn-go h-20 flex flex-col items-center justify-center">
          <span className="hw-title text-3xl">Go live</span>
          <span className="text-base opacity-90">{p.ready ? 'You sign in next' : 'Waiting for BUTT…'}</span>
        </button>
      </div>
    )
  }
  const ok = soundOk && clean
  return (
    <div className="h-full flex flex-col justify-center gap-3">
      {p.canGoLive ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <CheckButton label="Mic check" checked={soundOk} onToggle={toggleMic} />
            <CheckButton label="Clean music only" checked={clean} onToggle={() => setClean(x => !x)} />
          </div>
        </div>
      ) : <p className="lbl text-lg min-h-11 flex items-center">{p.reason}</p>}
      <button type="button" onClick={p.onGoLive} disabled={!!p.busy || !p.canGoLive || !p.ready || !ok}
              className="gbtn gbtn-go h-20 flex flex-col items-center justify-center">
        <span className="hw-title text-3xl">{p.busy === 'live' ? 'Going live…' : 'Go live'}</span>
        <span className="text-base opacity-90">{!p.canGoLive ? 'Not available yet' : ok ? 'Starts the stream and the recording' : soundOk ? 'Tick the clean music box first' : 'Say something into the mic'}</span>
      </button>
    </div>
  )
}

/** Fills the right side while nobody is signed in: no controls until then. */
function SignInInfo({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 text-center">
      <p className="hw-title text-4xl leading-tight">Thanks for using the studio! Get more features by signing in!</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/booth/door-qr.svg" alt="QR code to sign in at the studio" className="min-h-0 flex-1 max-h-[380px] aspect-square rounded-xl bg-white" />
      <p className="text-xl lbl">Scan the code with your phone, or sign in here.</p>
      <button type="button" className="gbtn gbtn-go h-20 text-3xl w-full max-w-xl" onClick={onSignIn}>Sign in with Babson Sound account</button>
    </div>
  )
}
