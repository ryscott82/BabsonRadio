'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { signInWithCustomToken } from 'firebase/auth'
import { signIn } from '@/lib/auth'
import { auth, db } from '@/lib/firebase'
import { attestHeaders, boothFetch, errText, helper } from './helper'

// What the studio PC shows when nobody is signed in: a big clock, a greeting, what is on now and next. Useful even when nobody is
// doing radio. Sign in, or (no account needed) type an email and watch the quick equipment training.

interface Item { id: string; title: string; hosts: string[]; startAt: number; endAt: number; category: string; source: string }
interface Idle { items: Item[]; trainingVideoId: string }

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayWord = (ms: number, now: number) => {
  const a = new Date(ms), b = new Date(now)
  if (a.toDateString() === b.toDateString()) return ''
  return new Date(now + 86_400_000).toDateString() === a.toDateString() ? 'Tomorrow ' : a.toLocaleDateString([], { weekday: 'short' }) + ' '
}
const firstNames = (hosts: string[]) => hosts.map(h => h.split(/\s+/)[0]).filter(Boolean)
const join = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

export default function IdleScreen({ onExitPanel }: { onExitPanel: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [data, setData] = useState<Idle | null>(null)
  const [view, setView] = useState<'home' | 'signin' | 'guest' | 'video'>('home')
  const [videoId, setVideoId] = useState('')
  const [drift, setDrift] = useState({ x: 0, y: 0 })
  const [door, setDoor] = useState<{ firstName: string; token: string; left: number } | null>(null)

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    let stop = false
    const load = () => boothFetch<Idle>('/api/booth/idle').then(d => { if (!stop) { setData(d); setVideoId(d.trainingVideoId) } }).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [])
  // Door QR: someone scanned the code on the door. The first snapshot is whatever scan happened last (ignored); a new one is claimed right away,
  // the PC says who is being signed in for 4 seconds (Cancel works), then signs in with the one-time token.
  useEffect(() => {
    let first = true, last = ''
    return onSnapshot(doc(db, 'boothDoorPing', 'latest'), snap => {
      const claimId = String(snap.get('claimId') ?? '')
      if (first) { first = false; last = claimId; return }
      if (!claimId || claimId === last) return
      last = claimId
      void (async () => {
        try {
          const h = await attestHeaders()
          const r = await boothFetch<{ customToken: string; firstName: string }>('/api/booth/door-claim', { claimId, nonce: h['x-booth-nonce'], sig: h['x-booth-sig'] })
          setDoor({ firstName: r.firstName, token: r.customToken, left: 4 })
        } catch { /* expired or not for this PC */ }
      })()
    }, () => {})
  }, [])
  useEffect(() => {
    if (!door) return
    if (door.left <= 0) { const t = door.token; setDoor(null); signInWithCustomToken(auth, t).catch(() => {}); return }
    const t = setTimeout(() => setDoor(d => (d ? { ...d, left: d.left - 1 } : d)), 1000)
    return () => clearTimeout(t)
  }, [door])

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
  const next = upcoming.filter(i => i.startAt > now).slice(0, 4)
  const soon = onNow ?? next.find(i => i.startAt - now <= 30 * 60_000)
  const names = soon ? firstNames(soon.hosts) : []
  const hello = names.length ? `Hello ${join(names)}` : 'Hello Babson Sound Member'
  const d = new Date(now)
  const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0'), ap = d.getHours() < 12 ? 'AM' : 'PM'

  return (
    <>
    {door && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/85" role="alertdialog" aria-label="Signing in">
        <div className="hw-screen p-12 text-center space-y-6">
          <p className="hw-title text-7xl">Hello {door.firstName}</p>
          <p className="text-3xl lbl">Signing you in…</p>
          <button type="button" className="gbtn h-16 px-10 text-2xl" onClick={() => setDoor(null)}>Not me, cancel</button>
        </div>
      </div>
    )}
    <div className="min-h-dvh flex flex-col justify-between py-10" style={{ transform: `translate(${drift.x}px, ${drift.y}px)`, transition: 'transform 2s' }}>
      <div className="hw-desk-text text-center">
        <p className="text-4xl">{d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p className="hw-title tabular-nums leading-none" style={{ fontSize: 'clamp(9rem, 26vw, 30rem)' }}>{h}:{m}<span className="text-[0.22em] ml-4 opacity-60">{ap}</span></p>
        <p className="hw-title text-6xl mt-2">{hello}</p>
        {soon && <p className="text-3xl mt-3 opacity-80">{onNow ? 'On air now' : `Starts at ${time(soon.startAt)}`}: {soon.title}</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr] px-8">
        <div className="hw-screen p-8">
          <p className="lbl text-2xl mb-3">{onNow ? 'On air now, then next' : 'Coming up'}</p>
          {(onNow ? [onNow, ...next].slice(0, 4) : next).length ? (
            <ul className="space-y-3">
              {(onNow ? [onNow, ...next].slice(0, 4) : next).map(i => (
                <li key={i.id} className="flex items-baseline gap-5 text-3xl">
                  <span className="num w-56 shrink-0">{i === onNow ? 'Now' : `${dayWord(i.startAt, now)}${time(i.startAt)}`}</span>
                  <span className="truncate">{i.title}{firstNames(i.hosts).length ? <span className="lbl"> · {join(firstNames(i.hosts))}</span> : null}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-3xl lbl">{data ? 'Nothing scheduled right now. Music from Auto DJ.' : 'Loading the schedule…'}</p>}
        </div>
        <div className="hw-screen p-8 flex flex-col gap-4 justify-center">
          <button type="button" className="gbtn gbtn-go h-24 text-4xl" onClick={() => setView('signin')}>Sign in to go on air</button>
          <button type="button" className="gbtn h-20 text-3xl" onClick={() => setView('guest')}>New here? Watch the training</button>
          <button type="button" className="gbtn h-12 text-xl opacity-70" onClick={onExitPanel}>Exit Babson Sound panel</button>
        </div>
      </div>
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
    <Frame title="Welcome to the studio" text="Sign in with your Babson Radio account. Each show is recorded." onBack={onBack}>
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
