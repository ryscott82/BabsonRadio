'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import DoorClaim from './DoorClaim'
import { boothFetch, errText, helper } from './helper'
import { themeNow } from '@/lib/booth'
import { Btn, Header, HelpPop, Ic, Led, LowImg, Stage } from './es2/Stage'

// What the studio PC shows when nobody is signed in (the Welcome face of the panel): a big clock, a greeting, what is on now and next. Useful even when nobody is
// doing radio. Sign in, or (no account needed) type an email and watch the quick equipment training.

interface Item { id: string; title: string; hosts: string[]; startAt: number; endAt: number; category: string; source: string }
interface Idle { items: Item[]; trainingVideoId: string; nowPlaying?: { title: string; artist: string; playedAt: number; duration: number; live: boolean; streamer: string; art?: string; listeners?: number } | null }

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? ''
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayWord = (ms: number, now: number) => {
  const a = new Date(ms), b = new Date(now)
  if (a.toDateString() === b.toDateString()) return ''
  return a.toLocaleDateString([], { weekday: 'short' }) + ' '
}
const firstNames = (hosts: string[]) => hosts.map(h => h.split(/\s+/)[0]).filter(Boolean)
const join = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

export default function IdleScreen({ onBypass }: { onBypass: (pin: string, session: object) => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [data, setData] = useState<Idle | null>(null)
  const [view, setView] = useState<'home' | 'signin' | 'guest' | 'video'>('home')
  const router = useRouter()
  const [bypassErr, setBypassErr] = useState('')
  const [help, setHelp] = useState(false)
  const [videoId, setVideoId] = useState('')
  const [drift, setDrift] = useState({ x: 0, y: 0 })
  // Listen to the station from this screen. Starts only on a tap (browsers require it), and stops when someone signs in.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [listening, setListening] = useState(false)
  const toggleRadio = () => {
    if (listening) { const a = audioRef.current; if (a) { a.pause(); a.removeAttribute('src'); a.load() } setListening(false); return }
    if (!STREAM_URL) { setBypassErr('The radio stream is not set up on this computer.'); return }
    const a = audioRef.current ?? (audioRef.current = new Audio())
    a.src = STREAM_URL
    a.play().then(() => setListening(true)).catch(() => setBypassErr('Could not start the radio. Try again.'))
  }
  useEffect(() => () => { const a = audioRef.current; if (a) { a.pause(); a.removeAttribute('src') } }, [])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    let stop = false
    const load = () => boothFetch<Idle>('/api/booth/idle').then(d => { if (!stop) { setData(d); setVideoId(d.trainingVideoId) } }).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [])
  // Burn-in protection: shift everything a few pixels every few minutes.
  useEffect(() => {
    const t = setInterval(() => setDrift({ x: Math.round(Math.random() * 24 - 12), y: Math.round(Math.random() * 24 - 12) }), 4 * 60_000)
    return () => clearInterval(t)
  }, [])

  const night = themeNow(now, null)
  if (view === 'signin') return <SignIn onBack={() => setView('home')} />
  if (view === 'guest') return <Guest onBack={() => setView('home')} onDone={id => { if (id) setVideoId(id); setView('video') }} />
  if (view === 'video') return <Video id={videoId} onDone={() => setView('home')} />

  const upcoming = (data?.items ?? []).filter(i => i.endAt > now)
  const onNow = upcoming.find(i => i.startAt <= now)
  const later = upcoming.filter(i => i.startAt > now).slice(0, onNow ? 8 : 9)
  const d = new Date(now)
  const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0'), ap = d.getHours() < 12 ? 'AM' : 'PM'
  // What is playing: only while that song is still within its length (the page asks every 5 minutes, so an old song is never shown as current).
  const np = data?.nowPlaying
  const playing = np && np.playedAt && np.duration && now < (np.playedAt + np.duration) * 1000 + 15_000 && (np.live || onNow) ? np : null
  const hostLine = (i: Item) => (firstNames(i.hosts).length ? `with ${join(firstNames(i.hosts))}` : '')
  const toSignIn = () => setView('signin')
  // Only when more than two people are tuned in.
  const listeners = playing && (playing.listeners ?? 0) > 2 ? `${playing.listeners} listening. ` : ''

  return (
    <>
      <DoorClaim />
      <Stage view="welcome" night={night} drift={drift}>
        {/* The internet needs a sign-in: a tap on any of the links goes to the sign-in page. */}
        <Header now={now} onLink={toSignIn} onHelp={() => setHelp(true)} />

        {/* The time is the first thing a studio screen should say. */}
        <div id="hero" className="lw">
          <div id="greet" className="px x2">Welcome to the Radio Room</div>
          <div id="bigtime" className="big"><span>{h}:{m}</span><span id="bigampm" className="px x2">{ap}</span></div>
          <div id="bigdate">
            <div className="px x2">{d.toLocaleDateString([], { weekday: 'long' })}</div>
            <div className="px x2 dim">{d.toLocaleDateString([], { month: 'long', day: 'numeric' })}</div>
          </div>
          <div id="status" className="row">
            <span className="px dim">Status</span>
            <span className={`px n ${bypassErr ? 'org' : ''}`} role={bypassErr ? 'alert' : undefined}>{bypassErr || `${listeners}Keep it clean. Respect quiet hours.${listeners ? '' : ' Leave the studio as you found it.'}`}</span>
          </div>
        </div>

        <div className="g">
          {/* Now playing: the cover in its case, the disc sliding out while a song is on. */}
          <div className="eng h" style={{ left: 26, top: 268 }}>Now playing</div>
          <Led id="radioled" c={listening ? 'green' : ''} />
          <Btn id="radio" on={listening} aria-pressed={listening} onClick={toggleRadio}>{listening ? 'Stop radio' : 'Play radio'}</Btn>
          <div id="case" className={playing ? 'out' : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img id="cd" src="/booth-es2/common/cd.png" width={165} height={165} alt="" />
            <LowImg id="art" src={playing?.art || '/booth/logo.png'} w={142} h={142} alt={playing?.art ? `Cover for ${playing.title}` : 'Babson Radio'} contain={!playing?.art} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/booth-es2/common/jewelcase.png" width={186} height={167} alt="" style={{ left: 0, top: 0 }} />
          </div>
          <div id="nowlcd" className="lw">
            <span className="px blk clip">{playing ? playing.title : onNow ? onNow.title : data ? 'Music from Babson Sound' : 'Loading…'}</span>
            <span className="px dim blk clip">{playing ? playing.artist || (onNow ? `${onNow.title} until ${time(onNow.endAt)}` : 'Music from Babson Sound') : onNow ? `${hostLine(onNow)}${hostLine(onNow) ? ', ' : ''}until ${time(onNow.endAt)}` : ''}</span>
          </div>

          {/* On now, then what is coming up. */}
          <div className="eng h" style={{ left: 318, top: 267 }}>Up next</div>
          <div id="nextlcd" className="lw">
            {onNow && (
              <div className="nrow row now"><i className="k" /><span className="px org" style={{ width: 74 }}>On now</span><span className="px n">{onNow.title}</span><span className="px dim r">to {time(onNow.endAt)}</span></div>
            )}
            {later.map(i => (
              <div key={i.id} className="nrow row"><i className="k" /><span className="px" style={{ width: 74 }}>{dayWord(i.startAt, now)}{time(i.startAt)}</span><span className="px n">{i.title}</span><span className="px dim r">{firstNames(i.hosts)[0] ?? ''}{i.hosts.length > 1 ? ` +${i.hosts.length - 1}` : ''}</span></div>
            ))}
            {!onNow && !later.length && <div className="nrow row"><i className="k" /><span className="px n">{data ? 'Studio is free' : 'Loading…'}</span></div>}
          </div>

          {/* How to go on air: scan the code (your phone is already signed in, nothing to type) or sign in on this computer. */}
          <div className="eng h" style={{ left: 614, top: 64 }}>Sign in</div>
          <div className="eng s" style={{ right: -936, top: 66 }}>Scan to use equipment</div>
          <div id="qr" className="lw" data-mx="soft"><LowImg src="/booth/door-qr.svg" w={196} h={196} alt="QR code to sign in at the studio" contain /></div>
          <div id="steps" className="lw">
            <span className="px dim blk">01</span><span className="px blk">Scan the code</span>
            <span className="px dim blk" style={{ marginTop: 8 }}>02</span><span className="px blk">Booth unlocks</span>
            <span className="px dim blk" style={{ marginTop: 8 }}>No phone?</span><span className="px blk">Use a button</span><span className="px blk">below</span>
          </div>
          <Btn id="signhere" kind="gr" onClick={toSignIn}>Sign in with Babson Sound account</Btn>
          <Btn id="wb0" onClick={() => router.push('/slots')}>Book a show</Btn>
          <Btn id="wb1" onClick={() => setView('guest')}>Training video</Btn>
          <Btn id="wb2" onClick={() => { setBypassErr(''); boothFetch<object>('/api/booth/bypass', { pin: '' }).then(r => onBypass('', r)).catch(e => setBypassErr(errText(e))) }}>Bypass sign in</Btn>

          <div className="eng h" style={{ left: 614, top: 407 }}>Internet</div>
          <div className="eng s" style={{ right: -936, top: 409 }}>Sign in to use it</div>
          <Btn id="netbig" onClick={toSignIn}><Ic n="globe" /><span>Web browser</span></Btn>
          {NET.map(([ic, label], i) => <Btn key={label} id={`nl${i}`} onClick={toSignIn}><Ic n={ic} /><span>{label}</span></Btn>)}
        </div>

        {help && <HelpPop onClose={() => setHelp(false)} />}
      </Stage>
    </>
  )
}

const NET: readonly [string, string][] = [['video', 'YouTube'], ['doc', 'Docs'], ['note', 'Notion'], ['wave', 'BandLab']]

function Frame({ title, text, children, onBack }: { title: string; text?: string; children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="hw-screen max-w-3xl w-full space-y-6 p-10">
        <div className="space-y-2">
          <h1 className="hw-title text-6xl leading-none">{title}</h1>
          {text && <p className="text-2xl lbl">{text}</p>}
        </div>
        {children}
        <button type="button" onClick={onBack} className="gbtn h-14 px-8 text-xl">Back</button>
      </div>
    </div>
  )
}

function SignIn({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useBackAfterIdle(onBack)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try { await signIn(email.trim().toLowerCase(), password) } catch (err) { setError(errText(err)); setPassword('') } finally { setBusy(false) }
  }
  const field = 'gfield w-full px-5 h-16 text-2xl'
  return (
    <Frame title="Welcome to the studio" text="Sign in with your Babson Sound account. Each show is recorded." onBack={onBack}>
      <form onSubmit={submit} className="space-y-5">
        <input aria-label="Email" placeholder="Email" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={e => setEmail(e.target.value)} className={field} />
        <input aria-label="Password" placeholder="Password" type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className={field} />
        {error && <p className="text-xl warn">{error}</p>}
        <button type="submit" disabled={busy || !email || !password} className="gbtn gbtn-go w-full h-20 text-3xl">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Frame>
  )
}

function Guest({ onBack, onDone }: { onBack: () => void; onDone: (videoId: string) => void }) {
  const [email, setEmail] = useState('')
  const [updates, setUpdates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useBackAfterIdle(onBack)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try { const r = await boothFetch<{ trainingVideoId: string }>('/api/booth/guest', { email: email.trim(), updates }); onDone(r.trainingVideoId) }
    catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }
  return (
    <Frame title="Quick equipment training" text="No account needed. Enter your email, then watch a short video on the mixer and booth." onBack={onBack}>
      <form onSubmit={submit} className="space-y-5">
        <input aria-label="Email" placeholder="you@example.com" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={e => setEmail(e.target.value)} className="gfield w-full px-5 h-16 text-2xl" />
        <label className="flex items-center gap-3 text-xl lbl"><input type="checkbox" checked={updates} onChange={e => setUpdates(e.target.checked)} className="h-6 w-6" /> Email me about Babson Radio news (optional)</label>
        {error && <p className="text-xl warn">{error}</p>}
        <button type="submit" disabled={busy || !email} className="gbtn gbtn-go w-full h-20 text-3xl">{busy ? 'One moment…' : 'Watch the training'}</button>
      </form>
    </Frame>
  )
}

function Video({ id, onDone }: { id: string; onDone: () => void }) {
  useBackAfterIdle(onDone, 15 * 60_000)
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="hw-screen max-w-6xl w-full p-6 space-y-5">
        {id ? (
          <div className="aspect-video w-full">
            <iframe className="w-full h-full rounded-lg" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`}
                    title="Studio equipment training" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
          </div>
        ) : <p className="text-4xl text-center p-16 lbl">The training video isn’t set up yet. Ask the E-board, or message the support group on the sheet by the door.</p>}
        <button type="button" onClick={onDone} className="gbtn gbtn-go h-20 w-full text-3xl">Done</button>
      </div>
    </div>
  )
}

/** Back to the idle home after a few minutes of nothing, so a half-filled form never stays on the big screen. */
function useBackAfterIdle(back: () => void, ms = 3 * 60_000) {
  useEffect(() => {
    let t = setTimeout(back, ms)
    const reset = () => { clearTimeout(t); t = setTimeout(back, ms) }
    window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset)
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset) }
  }, [back, ms])
}

/** Used by the page: closes the booth window and tells the studio PC to leave the booth alone for 30 minutes. */
/** Close the booth panel for 30 minutes. The signed-in person's token goes along so the helper can check they are E-board or Admin. */
export const exitPanel = (token?: string) => helper('/exit-booth', token ? { token } : {})
