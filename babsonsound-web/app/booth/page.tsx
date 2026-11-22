'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, signOut } from '@/lib/auth'
import { countdownText, heroMode, idleStep, MIXING_HOLD_MS, MIXING_PEAK_DBFS, MIXING_SNOOZE_MS, adBreak, bookingLines, quietBanner, type AdPlan, type HelperUpdate, type LevelState, type StudioStatus } from '@/lib/booth'
import { boothFetch, errText, helper, loadPref, mmss, savePref, type Butt, type Track } from '@/components/booth/helper'
import DoorClaim from '@/components/booth/DoorClaim'
import CrewPanel from '@/components/booth/CrewPanel'
import type { CrewPerson } from '@/lib/crew'
import { openSignIn } from '@/lib/signInPrompt'
import IdleScreen, { exitPanel } from '@/components/booth/IdleScreen'
import UpdateButton from '@/components/booth/UpdateButton'
import { useInputMeter } from '@/components/booth/useInputMeter'
import LevelMeter from '@/components/booth/LevelMeter'
import DeviceSettings, { type Devices } from '@/components/booth/DeviceSettings'
import MusicPlayer from '@/components/booth/MusicPlayer'
import { defaultMode, type LiveMode } from '@/lib/trackLog'
import Soundboard from '@/components/booth/Soundboard'
import { useClockNotices, useStationId } from '@/components/booth/ClockScreen'
import { useAutoGain } from '@/components/booth/useAutoGain'
import { useMicCheck } from '@/components/booth/CheckButton'
import { useShowInfo } from '@/components/booth/useShowInfo'
import { BROWSER_ACTIVE_MS, QUICK_LINKS, closeBrowser, openBrowser, setBrowserLayout, type BrowserState } from '@/components/booth/StudioBrowser'
import NoteBox from '@/components/booth/NoteBox'
import PhraseModal from '@/components/booth/PhraseModal'
import ShowInfo from '@/components/booth/ShowInfo'
import RecordShow, { useRecState } from '@/components/booth/RecordShow'
import { useBoothTheme } from '@/components/booth/useBoothTheme'
import { useStudioStatus } from '@/components/booth/useStudioStatus'
import { Btn, Header, HelpPop, Ic, Led, Note, Pop, Stage, Sw } from '@/components/booth/es2/Stage'

// Studio PC kiosk (Chrome --kiosk on babsonradio.com/booth): one hardware panel, 960 x 540 and doubled on the studio screen
// (components/booth/es2). Left: the loudness meter (with auto level). Centre: the time, the show, who is here and the big
// Go live / End show key (or Record a show). Right: tracks and the sound board. Quiet hours and who has the studio booked are
// information only: walk-ins always work, nothing is ever blocked.
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
  const [helperUpdate, setHelperUpdate] = useState<HelperUpdate | null>(null)
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
      try { const p = await helper<{ browser?: BrowserState; update?: HelperUpdate }>('/ping'); if (!stop) { setHelperUp(true); setBrowserSt(p.browser ?? null); setHelperUpdate(p.update ?? null) } } catch { if (!stop) { setHelperUp(false); setButt(null) } return }
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

  const [exitErr, setExitErr] = useState('')
  const leavePanel = async (token?: string) => {
    setExitErr(''); setExited(true)
    try { await exitPanel(token) } catch (e) { setExited(false); setExitErr(errText(e)) }
  }

  return (
    <>
      {/* Pure black from 7 pm to 7 am, over the oak desk. */}
      {theme.night && <div className="fixed inset-0 z-[1] bg-black" aria-hidden />}
      {/* Nobody signed in: offer the update (the button stays while the helper restarts, so it can reload the page after). */}
      {!loading && !user && !bypass && !exited && <UpdateButton helperUpdate={helperUpdate} />}
      {exitErr && <p role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[95] hw-screen px-6 py-3 text-2xl warn">Couldn’t close the panel: {exitErr}</p>}
      <div className={`relative z-[2] -mt-16 -mb-12 min-h-dvh px-8 py-6 text-lg ${theme.night ? 'booth-night' : ''}`}>
        {exited ? (
          <Center title="Booth panel closed" text="The panel comes back by itself in about 30 minutes." />
        ) : helperUp === false ? (
          <Center title="The studio helper isn’t running" text="Open “start-helper” on this computer and wait a few seconds." />
        ) : loading ? null : !user && !bypass ? (
          <IdleScreen onBypass={(pin, session) => setBypass({ pin, session: session as Session })} />
        ) : (
          <Console butt={butt} buttRef={buttRef} buttErr={buttErr} browserSt={browserSt} key={user?.uid ?? 'bypass'} onExitPanel={leavePanel} night={theme.night}
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

function Console({ butt, buttRef, buttErr, browserSt, onExitPanel, night, bypass, onBypassEnd, autoLive, onWantLive, onUnlock }: { butt: Butt | null; buttRef: React.MutableRefObject<Butt | null>; buttErr: string; browserSt: BrowserState | null; onExitPanel: (token?: string) => void | Promise<void>; night: boolean; bypass: { pin: string; session: Session } | null; onBypassEnd: () => void; autoLive: boolean; onWantLive: (v: boolean) => void; onUnlock: (pin: string) => void }) {
  const { isGuest, user } = useAuth()
  const router = useRouter()
  const [s, setS] = useState<Session | null>(bypass?.session ?? null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)
  const [devices, setDevices] = useState<Devices>(() => ({ input: loadPref('input'), music: loadPref('music') }))
  const [modal, setModal] = useState<'' | 'sound' | 'note' | 'show'>('')
  const [signInOpen, setSignInOpen] = useState(false)
  const [phrases, setPhrases] = useState(false) // the Explicit phrase reference pop-up
  const [pop, setPop] = useState<'' | 'help' | 'set'>('') // the panel's own pop-ups
  const [toast, setToast] = useState('')                  // someone joined the studio (from the crew)
  const [recNote, setRecNote] = useState('')              // what the recorder has to say (an upload, an error)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast])
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
    setPickedMode(null) // the next show starts from its own category
  })

  // Talk show or Music show: starts from the show's category (Music = music show) and the host can flip it at any time. Listeners see it
  // (a small now-playing line, or the song large) and the live log keeps it, so a recording shows the same thing when it is played back.
  const [pickedMode, setPickedMode] = useState<LiveMode | null>(null)
  const showMode: LiveMode = pickedMode ?? defaultMode(info.show?.category)
  const liveRef = useRef(live)
  useEffect(() => { liveRef.current = live }, [live])
  useEffect(() => { if (live) report('mode', { mode: showMode }).catch(() => {}) }, [live, showMode, report])

  const trackOn = useRef(false), idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onAired = useCallback((t: Track) => {
    if (!t.bed) setLastMusicAt(Date.now())
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null }
    trackOn.current = true
    report('music', { title: t.title, artist: t.artist, art: t.art ?? '', bed: t.bed }).catch(() => {})
  }, [report])
  // The music stopped (or an ad or station ID is on): tell listeners after a moment, so the changeover between two songs is not a gap.
  const onIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null
      if (!trackOn.current) return
      trackOn.current = false
      if (liveRef.current) report('gap').catch(() => {})
    }, 1500)
  }, [report])
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current) }, [])

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
  const sb = 'fillb'
  const staffRole = s?.role ?? s?.level ?? ''  // the session's role when the server sends one, else the access level (director is the E-board)
  const canExit = !bypass && ['admin', 'eboard', 'director'].includes(staffRole)
  const isAdmin = !bypass && staffRole === 'admin'

  const next = s?.next
  const hero = heroMode({ live, connecting, sinceMs: now - since, nextStartAt: next?.startAt ?? null, now, show: s?.show ?? null })
  const leftS = s?.show ? Math.round((s.show.endAt - now) / 1000) : 0 // seconds left in the booked show (negative: over time)
  const countdownBig = hero === 'countdown' && !!next
  const showBig = hero === 'show' || hero === 'ending' || hero === 'over'
  const showName = info.show ? info.show.title : s?.show?.title || ''
  const hostsValue = hostsText ?? ((info.show?.hosts.length ? info.show.hosts.join(', ') : '') || (bypass ? '' : s?.name ?? ''))
  const canEditShow = !!s?.canGoLive || !!s?.canRecord || live
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
  // Studio browser open: split keeps the centre of the panel (the right half is the browser); full leaves a slim rail.
  const bl = browserSt?.open ? browserSt.layout : ''
  const area: React.CSSProperties | undefined = bl === 'split' ? { right: '50%' } : bl === 'full' ? { right: `calc(100% - ${browserSt?.railPx ?? 260}px)` } : undefined
  const idle = !live && !connecting && !recording
  const openLink = (i: number) => {
    const l = i ? QUICK_LINKS[i - 1] : { url: 'https://www.google.com/', layout: undefined }
    void token().then(t => openBrowser(t, l.url, l.layout)).catch(e => setError(errText(e)))
  }
  const toSplit = () => void token().then(t => setBrowserLayout(t, 'split')).catch(e => setError(errText(e)))
  const shutBrowser = () => void closeBrowser().catch(e => setError(errText(e)))

  // The big read-out in the centre: the welcome, the countdown to the next show, or the time left in this one.
  const firstName = bypass ? '' : s?.firstName || ''
  const big = hero === 'over' ? { lbl: 'Over time, wrap up', main: `+${mmss(-leftS)}`, warn: true }
    : showBig && s?.show ? { lbl: leftS <= 300 ? 'Time left, wrap up' : 'Time left', main: mmss(leftS), warn: leftS <= 300 }
    : countdownBig && next ? { lbl: 'Next show in', main: countdownText(next.startAt - now), warn: false }
    : live || connecting ? { lbl: 'On air for', main: mmss(butt?.streamSeconds ?? 0), warn: false }
    : { lbl: firstName ? 'Welcome' : 'Welcome to the studio', main: firstName || clock(now), warn: false }
  const bigSmall = !!firstName && big.lbl === 'Welcome' ? true : big.main.length > 5
  const airWord = live ? 'On air' : connecting ? 'Connecting' : recording ? 'Recording' : 'Off air'
  const slotLine = showBig && s?.show ? `${clock(s.show.startAt)} to ${clock(s.show.endAt)}` : next ? `Next: ${next.title}` : 'Nothing booked'
  const stateLine = deadAir > 0 ? `Dead air ${deadAir} s`
    : live ? (butt?.recording ? 'Recording the show' : 'On air, not recording')
    : connecting ? 'Connecting…' : recording ? 'Recording, not on air'
    : next ? `${clock(next.startAt)}${next.hosts.length ? ` with ${next.hosts.join(', ')}` : ''}` : ready ? 'Ready' : 'Waiting for BUTT'
  const lastNote = s?.note ? `Note from ${s.note.by || 'the last host'}: ${s.note.text}` : ''
  const quietDue = !!quietKey && quietAck !== quietKey && !!s

  return (
    <>
      <Stage view="booth" night={night} split={bl} live={live}>
        <Header now={now} onLink={openLink} onHelp={() => setPop('help')} onSettings={() => setPop('set')}
                browser={bl === 'split' ? { full: false, onLayout: () => void token().then(t => setBrowserLayout(t, 'full')).catch(e => setError(errText(e))), onClose: shutBrowser } : undefined} />

        <LevelMeter frame={meter.frame} stats={meter.stats} error={meter.error} deadAir={deadAir} auto={auto} staff={['admin', 'eboard', 'director'].includes(staffRole)} night={night} />

        {/* The raised centre: the time, the show, who is here, the checks and the big key. It is all that stays in split view. */}
        <div id="mid" className="nofull">
          <div id="timebox" className="lw">
            <span className="px dim lbl0">{big.lbl}</span>
            <div id="remain" className={`big ${bigSmall ? 'sm' : ''} ${big.warn ? 'org' : ''}`}>{big.main}</div>
            <div id="airstate" className={`px x2 ${live ? 'org' : 'dim'}`} role="status">{airWord}</div>
            <div id="slot" className="px">{slotLine}</div>
            <div id="elapsed" className={`px ${deadAir > 0 ? 'org' : 'dim'}`}>{stateLine}</div>
            <div id="tbrow" className="row">
              <span id="showname" className="px">{showName || 'No show name yet'}</span>
              <Ticker problem={problem || info.error} ads={s?.ads ?? null} live={live} lastMusicAt={lastMusicAt} status={studio.status} myBookingId={studio.myBookingId}
                      rest={recNote || lastNote || (nowTrack ? `Playing: ${nowTrack.title}` : '')} />
            </div>
          </div>
          <div className="eng h" style={{ left: 12, top: 158 }}>Show info</div>
          <div className="eng s" style={{ right: 12, top: 160 }}>{live ? 'Shown on the site and app' : 'Change it any time'}</div>
          <label className="eng s" htmlFor="f-show" style={{ left: 12, top: 178 }}>Show name</label>
          <div id="f_show" className="fld lw">
            <input id="f-show" value={showName} onChange={e => info.change({ title: e.target.value })} readOnly={!canEditShow} maxLength={80} placeholder="Name your show"
                   title={canEditShow ? '' : 'Sign in to name the show.'} autoComplete="off" spellCheck={false} />
          </div>
          <label className="eng s" htmlFor="f-track" style={{ left: 12, top: 204 }}>Track title</label>
          <div id="f_track" className="fld lw">
            <input id="f-track" value={trackText ?? (nowTrack ? `${nowTrack.title}${nowTrack.artist ? ` · ${nowTrack.artist}` : ''}` : '')} placeholder="Nothing playing. Type a track."
                   onChange={e => setTrackText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={sendTrack}
                   title={live ? 'Press Enter to show this on the site and app.' : ''} autoComplete="off" spellCheck={false} />
          </div>
          <label className="eng s" htmlFor="f-host" style={{ left: 12, top: 230 }}>Host name</label>
          <div id="f_host" className="fld lw">
            <input id="f-host" value={hostsValue} onChange={e => { setHostsText(e.target.value); info.change({ hosts: e.target.value.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean) }) }}
                   readOnly={!canEditShow} placeholder={bypass ? 'Not signed in' : 'Who is on the show'} title={canEditShow ? 'Separate names with commas.' : 'Sign in to edit.'} autoComplete="off" spellCheck={false} />
          </div>

          <div className="eng s" style={{ left: 12, top: 269 }}>In the studio</div>
          {bypass ? <div id="hostlist" className="lw row px"><span className="dim">Nobody signed in</span></div>
            : <CrewPanel sessionId={s?.sessionId ?? ''} crew={s?.crew ?? []} driverName={s?.firstName || s?.name || ''} onAir={!idle} getToken={token} onToast={setToast} />}
          {confirmOut ? (
            <>
              <Btn id="signout" onClick={signOutNow} disabled={!!busy}>{live ? 'End and sign out' : 'Stop and sign out'}</Btn>
              <Btn id="stay" onClick={() => setConfirmOut(false)}>Stay</Btn>
            </>
          ) : (
            <Btn id="signout" onClick={() => (live || recording ? setConfirmOut(true) : signOutNow())} disabled={!!busy}>{bypass ? 'Back to sign in' : 'Sign out'}</Btn>
          )}

          {!bypass && idle && (
            <>
              <Btn id="modelive" on={shownMode === 'live'} aria-pressed={shownMode === 'live'} onClick={() => setMode('live')}>Go live</Btn>
              <Btn id="moderec" on={shownMode === 'record'} aria-pressed={shownMode === 'record'} onClick={() => setMode('record')}>Record a show</Btn>
            </>
          )}
          {shownMode === 'live' ? (
            <GoLive live={live} connecting={connecting} recording={!!butt?.recording} onAirSeconds={butt?.streamSeconds ?? 0}
                    canGoLive={!!s?.canGoLive} signInToLive={!!bypass && !!s?.signInToLive} onSignIn={() => { onWantLive(true); setSignInOpen(true) }} reason={s?.reason ?? ''} ready={ready} busy={busy}
                    level={meter.stats.state} ads={s?.ads ?? null} onGoLive={goLive} onEnd={endShow} onPlayAds={() => setAdCue(n => n + 1)} extra={!confirmOut} />
          ) : (
            <RecordShow st={rec.st} reload={rec.reload} getToken={token} live={live || connecting} ready={ready} level={meter.stats.state} myUid={user?.uid ?? ''} extra={!confirmOut} onStatus={setRecNote} />
          )}
        </div>

        {/* Right: tracks and the sound board (or the sign-in card). Hidden, not removed, while the browser is open, so a track that is playing keeps playing. */}
        {bypass ? (
          <div className="g hf">
            <div className="eng h" style={{ left: 640, top: 64 }}>Sign in for more</div>
            <div id="tracks" className="lw"><span className="px msg">Thanks for using the studio. Sign in for the tracks and the sound board. Scan the code by the door, or sign in here.</span></div>
            <Btn id="bysign" kind="gr" onClick={() => openSignIn(false)}>Sign in</Btn>
            <div className="eng h" style={{ left: 640, top: 312 }}>Sound board</div>
            <div id="pads" className="lw" />
          </div>
        ) : (
          <>
            <MusicPlayer getToken={token} live={live} output={devices.music} idCue={idCue} adCue={adCue} onAired={onAired} onIdle={onIdle} onTrack={setNowTrack} mode={showMode} onMode={setPickedMode} />
            <Soundboard getToken={token} output={devices.music} />
          </>
        )}

        {/* Browser on the whole screen: only this slim rail of the panel shows. */}
        {bl === 'full' && (
          <div id="rail" data-layer="">
            <div id="rail-onair" className="lw row px" role="status">On air</div>
            <div id="rail-clock" className="lw row px">{clock(now)}</div>
            <div id="rail-status" className="lw">
              <span className={`px blk ${deadAir > 0 ? 'org' : ''}`}>{stateLine}</span>
              {problem && <span className="px org blk">{problem}</span>}
            </div>
            {stillThere > 0 && <Btn id="rail-b0" onClick={() => setStillThere(0)}>Still here? {stillThere} s</Btn>}
            {quietDue && <Btn id="rail-b1" onClick={ackQuiet}>Quiet hours: OK</Btn>}
            <Btn id="rail-b2" onClick={toSplit}><Ic n="split" /><span>Split screen</span></Btn>
            <Btn id="rail-b3" onClick={shutBrowser}><Ic n="x" /><span>Close browser</span></Btn>
            {(live || connecting) && <Btn id="rail-b4" onClick={endShow} disabled={!!busy}>{busy === 'stop' ? 'Ending…' : 'End show'}</Btn>}
            <canvas className="txl" width={130} height={540} />
          </div>
        )}

        <Notices stillThere={stillThere} onStill={() => setStillThere(0)} quiet={quietDue} quietUntil={quietNow?.kind === 'on' ? quietNow.until ?? 0 : 0} onQuietOk={ackQuiet}
                 live={live} toast={toast} onPlayId={() => setIdCue(n => n + 1)} />

        {pop === 'help' && <HelpPop onClose={() => setPop('')} />}
        {pop === 'set' && (
          <Pop id="pop-set" title="Settings" onClose={() => setPop('')}>
            <div id="setinfo" className="lw">
              <span className="px blk">{bypass ? 'Nobody signed in' : `Signed in: ${s?.name ?? '…'}${staffRole ? ` (${staffRole})` : ''}`}</span>
              <span className={`px blk ${ready ? 'dim' : 'org'}`}>{ready ? 'The studio computer is ready.' : 'BUTT isn’t answering. Open BUTT on this computer.'}</span>
            </div>
            <Btn id="sb0" onClick={() => { setPop(''); setModal('sound') }}>Audio setup</Btn>
            <Btn id="sb1" disabled={!!bypass || !s} onClick={() => { setPop(''); setModal('note') }}>Leave a note</Btn>
            {/* Works on air too: check a word or a lyric without leaving the booth. Trained members only (not the no-sign-in bypass).
                The slot (its position and its key bitmap) is the wrapper; the button inside fills it. */}
            <div id="sb2" className="btn m" onClick={() => setPop('')}>
              {!bypass && <button type="button" className={sb} onClick={() => setPhrases(true)}>Phrase reference</button>}
              {bypass && <span style={{ opacity: 0.4 }}>Phrase reference</span>}
            </div>
            <Btn id="sb3" disabled={!canEditShow} onClick={() => { setPop(''); setModal('show') }}>Show details</Btn>
            {/* Admins: the babsonradio.com Settings panel in this window (already signed in). "Back to the booth" brings them back. */}
            <Btn id="sb4" disabled={!isAdmin || !idle} onClick={() => router.push('/admin')}>Admin settings</Btn>
            <Btn id="sb5" disabled={!canExit || !idle} onClick={async () => { setPop(''); let tk = ''; try { tk = await token() } catch { /* the helper decides */ } void onExitPanel(tk) }}>Exit panel</Btn>
          </Pop>
        )}
      </Stage>

      {/* Dialogs that still use the old look, above the panel. */}
      {phrases && <PhraseModal onClose={() => setPhrases(false)} />}
      {bypass && <DoorClaim />}
      {signInOpen && bypass && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 px-8" style={area} role="dialog" aria-label="Sign in to go live">
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
    </>
  )
}

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The plate that drops from the top, for the few things that need an answer: still there, quiet hours, someone joined, the station ID. */
function Notices(p: { stillThere: number; onStill: () => void; quiet: boolean; quietUntil: number; onQuietOk: () => void; live: boolean; toast: string; onPlayId: () => void }) {
  const id = useStationId(p.live)
  if (p.stillThere > 0) return <Note show block head="Are you still using the studio?" body={`Signing out in ${p.stillThere} seconds.`} buttons={[{ label: 'Yes', onClick: p.onStill }]} />
  if (p.quiet) return <Note show block head="It’s quiet hours" body={`Keep the volume low. No loud DJ sets.${p.quietUntil ? ` Ends at ${fmtClock(p.quietUntil)}.` : ''}`} buttons={[{ label: 'OK', onClick: p.onQuietOk }]} />
  if (p.toast) return <Note show led="green" head={p.toast} body="They are added to the show’s hosts." />
  if (id.due) return <Note show led="green" head="Play the station ID" body="It is the top of the hour." buttons={[{ label: 'Play', onClick: () => { p.onPlayId(); id.done() } }, { label: 'Done', onClick: id.done }]} />
  return <Note show={false} head="" body="" />
}

/** The right end of the read-out's bottom line: what needs saying now, most pressing first. Warnings only: nothing here blocks anything. */
function Ticker(p: { problem: string; ads: AdPlan | null; live: boolean; lastMusicAt: number; status: StudioStatus | null; myBookingId: string; rest: string }) {
  const c = useClockNotices(p.ads, p.live, p.lastMusicAt)
  const q = quietBanner(p.status, c.now)
  const lines = bookingLines(p.status, p.myBookingId, c.now, fmtClock)
  const [text, warn] = p.problem ? [p.problem, true]
    : c.ad ? [`${c.ad.now ? 'Ad break, back in' : 'Ad break in'} ${mmss(((c.ad.now ? c.ad.end : c.ad.start) - c.now) / 1000)}`, true]
    : c.talking ? [`Talking ${mmss(c.talking)}`, true]
    : q?.kind === 'soon' ? [`Quiet hours start in ${mmss(q.inMs / 1000)}`, true]
    : q?.kind === 'on' ? [`Quiet hours${q.until ? ` until ${fmtClock(q.until)}` : ''}`, true]
    : lines.length ? [lines.join(' · '), false]
    : [p.rest, false]
  return <span id="trackline" className={`px ${warn ? 'org' : 'dim'}`} role={warn ? 'status' : undefined}>{text}</span>
}

/** The big key. Off air: two quick checks (the mic check ticks itself when it hears the mic), then Go live.
 *  On air: End show, with the time on air and whether BUTT is recording. */
function GoLive(p: {
  live: boolean; connecting: boolean; recording: boolean; onAirSeconds: number
  canGoLive: boolean; signInToLive: boolean; onSignIn: () => void; reason: string; ready: boolean; busy: string; level: LevelState
  ads: AdPlan | null; onGoLive: () => void; onEnd: () => void; onPlayAds: () => void
  /** The small key above the big one is free (Stay is not showing there). */
  extra: boolean
}) {
  const [clean, setClean] = useState(false)
  const [soundOk, toggleMic] = useMicCheck(p.level)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const ad = p.ads ? adBreak(p.ads, now) : null

  if (p.live || p.connecting) {
    return (
      <>
        {ad?.now && p.extra && <Btn id="adsbtn" onClick={p.onPlayAds}>Play the ads</Btn>}
        <Btn id="golive" kind="lv" on onClick={p.onEnd} disabled={!!p.busy}>
          <b>{p.busy === 'stop' ? 'Ending…' : 'End show'}</b>
          <span>{p.connecting ? 'Connecting…' : `On air ${mmss(p.onAirSeconds)}${p.recording ? ' · recording' : ''}`}</span>
        </Btn>
      </>
    )
  }
  if (p.signInToLive) {
    return (
      <>
        <div className="eng s" style={{ left: 12, top: 329 }}>Mixing? Press Go live, then sign in.</div>
        <Btn id="golive" kind="lv" onClick={p.onSignIn} disabled={!p.ready}>
          <b>Go live</b>
          <span>{p.ready ? 'You sign in next' : 'Waiting for BUTT…'}</span>
        </Btn>
      </>
    )
  }
  const ok = soundOk && clean
  return (
    <>
      {p.canGoLive ? (
        <>
          {/* Go live stays off until both switches are on. */}
          <div className="eng s" style={{ left: 12, top: 329 }}>Check to go live:</div>
          <Sw id="micsw" on={soundOk} onChange={toggleMic} label="Mic check" /><Led id="micled" c={soundOk ? 'green' : ''} />
          <div className="eng s" style={{ left: 162, top: 329 }}>Mic check</div>
          <Sw id="cleansw" on={clean} onChange={setClean} label="Clean music only" /><Led id="cleanled" c={clean ? 'green' : ''} />
          <div className="eng s" style={{ left: 286, top: 329 }}>Clean music only</div>
        </>
      ) : <div className="eng s" style={{ left: 12, top: 329 }}>{p.reason}</div>}
      <Btn id="golive" kind="lv" onClick={p.onGoLive} disabled={!!p.busy || !p.canGoLive || !p.ready || !ok}>
        <b>{p.busy === 'live' ? 'Going live…' : 'Go live'}</b>
        <span>{!p.canGoLive ? 'Not available yet' : ok ? 'Starts the stream and the recording' : soundOk ? 'Switch on Clean music only first' : clean ? 'Say something into the mic, or switch on Mic check' : 'Switch on both checks to go live'}</span>
      </Btn>
    </>
  )
}
