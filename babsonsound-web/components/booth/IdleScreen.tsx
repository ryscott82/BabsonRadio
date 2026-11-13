'use client'

import { useEffect, useState } from 'react'
import { signIn } from '@/lib/auth'
import DoorClaim from './DoorClaim'
import { boothFetch, errText, helper } from './helper'
import { BrowserButtons } from './StudioBrowser'

// What the studio PC shows when nobody is signed in: a big clock, a greeting, what is on now and next. Useful even when nobody is
// doing radio. Sign in, or (no account needed) type an email and watch the quick equipment training.

interface Item { id: string; title: string; hosts: string[]; startAt: number; endAt: number; category: string; source: string }
interface Idle { items: Item[]; trainingVideoId: string; nowPlaying?: { title: string; artist: string; playedAt: number; duration: number; live: boolean; streamer: string } | null }

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayWord = (ms: number, now: number) => {
  const a = new Date(ms), b = new Date(now)
  if (a.toDateString() === b.toDateString()) return ''
  return new Date(now + 86_400_000).toDateString() === a.toDateString() ? 'Tomorrow ' : a.toLocaleDateString([], { weekday: 'short' }) + ' '
}
const firstNames = (hosts: string[]) => hosts.map(h => h.split(/\s+/)[0]).filter(Boolean)
const join = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

export default function IdleScreen({ onBypass }: { onBypass: (pin: string, session: object) => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [data, setData] = useState<Idle | null>(null)
  const [view, setView] = useState<'home' | 'signin' | 'guest' | 'video'>('home')
  const [bypassErr, setBypassErr] = useState('')
  const [videoId, setVideoId] = useState('')
  const [drift, setDrift] = useState({ x: 0, y: 0 })

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

  if (view === 'signin') return <SignIn onBack={() => setView('home')} />
  if (view === 'guest') return <Guest onBack={() => setView('home')} onDone={id => { if (id) setVideoId(id); setView('video') }} />
  if (view === 'video') return <Video id={videoId} onDone={() => setView('home')} />

  const upcoming = (data?.items ?? []).filter(i => i.endAt > now)
  const onNow = upcoming.find(i => i.startAt <= now)
  const later = upcoming.filter(i => i.startAt > now)
  const upNext = later[0]
  const rest = later.slice(1, 4)
  const d = new Date(now)
  const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0'), ap = d.getHours() < 12 ? 'AM' : 'PM'
  // What is playing: only while that song is still within its length (the page asks every 5 minutes, so an old song is never shown as current).
  const np = data?.nowPlaying
  const playing = np && np.playedAt && np.duration && now < (np.playedAt + np.duration) * 1000 + 15_000 && (np.live || onNow) ? np : null
  const hostLine = (i: Item) => (firstNames(i.hosts).length ? `with ${join(firstNames(i.hosts))}` : '')

  return (
    <>
    <DoorClaim />
    <div className="fixed inset-0 z-[2] flex flex-col gap-5 px-10 pt-6 pb-6 overflow-hidden" style={{ transform: `translate(${drift.x}px, ${drift.y}px)`, transition: 'transform 2s' }}>
      <h1 className="hw-desk-text hw-title text-center leading-none shrink-0" style={{ fontSize: 'clamp(3rem, 7vh, 5.5rem)' }}>Welcome to Babson Radio</h1>
      <div className="grid grid-cols-[1.05fr_1fr_1fr] gap-6 flex-1 min-h-0">
        {/* The time is the first thing a studio screen should say. */}
        <section className="hw-desk-text flex flex-col min-w-0">
          <div>
            <p className="hw-title leading-[0.85] tabular-nums" style={{ fontSize: 'clamp(7rem, 26vh, 17rem)' }}>{h}:{m}<span className="text-[0.22em] ml-3 opacity-60">{ap}</span></p>
            <p className="hw-title text-5xl leading-tight mt-3">{d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </section>

        {/* On now, Up next, Later today. */}
        <section className="flex flex-col gap-4 min-h-0 min-w-0">
          <div className="bp px-7 py-5 shrink-0">
            <p className="lbl text-2xl">On now</p>
            {onNow ? (
              <>
                <p className="hw-title text-5xl leading-tight line-clamp-2">{onNow.title}</p>
                <p className="text-2xl lbl truncate">{hostLine(onNow)}{hostLine(onNow) ? ' · ' : ''}until {time(onNow.endAt)}</p>
              </>
            ) : <p className="hw-title text-4xl leading-tight">{data ? 'Music from Babson Sound' : 'Loading…'}</p>}
            {playing && <p className="text-2xl mt-2 truncate"><span className="lbl">Now playing </span>{playing.title}{playing.artist ? ` · ${playing.artist}` : ''}</p>}
          </div>
          <div className="bp px-7 py-5 shrink-0">
            <p className="lbl text-2xl">Up next</p>
            {upNext ? (
              <>
                <p className="hw-title text-4xl leading-tight line-clamp-2">{upNext.title}</p>
                <p className="text-2xl lbl truncate">{dayWord(upNext.startAt, now)}{time(upNext.startAt)}{hostLine(upNext) ? ` · ${hostLine(upNext)}` : ''}</p>
              </>
            ) : <p className="hw-title text-4xl leading-tight">{data ? 'Studio is free' : 'Loading…'}</p>}
          </div>
          <div className="bp px-7 py-5 flex-1 min-h-0 overflow-hidden">
            <p className="lbl text-2xl mb-2">Later today</p>
            {rest.length ? (
              <ul className="space-y-2">
                {rest.map(i => (
                  <li key={i.id} className="flex items-baseline gap-4 text-2xl">
                    <span className="num w-36 shrink-0">{dayWord(i.startAt, now)}{time(i.startAt)}</span>
                    <span className="truncate">{i.title}{firstNames(i.hosts).length ? <span className="lbl"> · {join(firstNames(i.hosts))}</span> : null}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-2xl lbl">Nothing else booked.</p>}
          </div>
        </section>

        {/* How to go on air: scan the code (your phone is already signed in, nothing to type) or sign in on this computer. */}
        <section className="bp px-7 py-6 min-h-0 min-w-0 flex flex-col items-center gap-4 text-center">
          <p className="hw-title text-5xl leading-tight">Scan to sign in</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/booth/door-qr.svg" alt="QR code to sign in at the studio" className="min-h-0 flex-1 max-h-[42vh] aspect-square rounded-xl bg-white" />
          <ol className="text-2xl text-left space-y-1 w-full max-w-md list-decimal pl-8">
            <li>Scan the code with your phone.</li>
            <li>Sign in on your phone.</li>
            <li>This screen opens for you.</li>
          </ol>
          <button type="button" className="gbtn gbtn-go h-20 text-3xl w-full" onClick={() => setView('signin')}>Sign in with Babson Sound account</button>
          <div className="flex items-center gap-2">
            <button type="button" className="gbtn h-12 px-5 text-xl" onClick={() => setView('guest')}>New here? Training</button>
            <button type="button" className="gbtn h-12 px-4 text-base opacity-70" onClick={() => { setBypassErr(''); boothFetch<object>('/api/booth/bypass', { pin: '' }).then(r => onBypass('', r)).catch(e => setBypassErr(errText(e))) }}>Bypass sign in</button>
          </div>
        </section>
      </div>

      <footer className="hw-desk-text flex items-center gap-5 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/booth/logo.png" alt="Babson Radio" className="h-16 w-16 object-contain" />
        <p className="text-2xl opacity-85">Keep it clean. Respect quiet hours. Leave the studio as you found it.</p>
        {/* The internet needs a sign-in: a tap on any of these goes to the sign-in page. */}
        <div className="ml-auto flex items-center gap-2" role="group" aria-label="Internet. Sign in to use it.">
          <span className="text-xl opacity-85 mr-2">Sign in to use the internet</span>
          <BrowserButtons state={null} getToken={async () => ''} onError={setBypassErr} onLocked={() => setView('signin')} />
        </div>
      </footer>
      {bypassErr && <p className="fixed bottom-2 left-1/2 -translate-x-1/2 text-lg warn">{bypassErr}</p>}
    </div>
    </>
  )
}

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
export const exitPanel = () => helper('/exit-booth', {})
