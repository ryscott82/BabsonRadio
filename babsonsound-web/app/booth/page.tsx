'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, signIn, signOut } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import { BOOTH_HELPER_ORIGIN } from '@/lib/booth'

// Studio PC kiosk (Chrome --kiosk on babsonradio.com/booth). Sign in, go live, type songs, end the show.
// Talks to the studio helper on 127.0.0.1 (tools/studio-helper), which drives BUTT. Only works on the studio PC.

interface Butt { connected: boolean; connecting: boolean; recording: boolean; signal: boolean; silence: boolean; streamSeconds: number; volumeLeft: number; volumeRight: number; song: string }
interface Show { title: string; occId: string; startAt: number; endAt: number }
interface Session {
  sessionId: string; name: string; level: string; canGoLive: boolean; reason: string
  show: Show | null; nextShow: Show | null; token: string; tokenExp: number
}

const IDLE_MS = 10 * 60_000
const REFRESH_MS = 4 * 60_000

async function helper<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BOOTH_HELPER_ORIGIN}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8_000),
    })
  } catch { throw new Error("The studio helper isn't running.") }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'The studio helper refused.')
  return data as T
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const hms = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}`
}
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

export default function BoothPage() {
  const { user, loading } = useAuth()
  const [helperUp, setHelperUp] = useState<boolean | null>(null)
  const [butt, setButt] = useState<Butt | null>(null)
  const [buttErr, setButtErr] = useState('')

  // Helper and BUTT status, every 2 seconds, signed in or not.
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try { await helper('/ping'); if (!stop) setHelperUp(true) } catch { if (!stop) { setHelperUp(false); setButt(null) } return }
      try { const b = await helper<Butt>('/status'); if (!stop) { setButt(b); setButtErr('') } }
      catch (e) { if (!stop) { setButt(null); setButtErr(msg(e)) } }
    }
    tick()
    const t = setInterval(tick, 2_000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  return (
    <div className="min-h-dvh -mt-16 -mb-12 flex flex-col">
      <TopBar helperUp={helperUp} butt={butt} buttErr={buttErr} />
      <div className="flex-1 flex items-start justify-center px-6 py-10">
        {helperUp === false ? (
          <Notice title="Studio helper isn't running" text="Open “start-helper” on this PC, then wait a few seconds." />
        ) : loading ? null : !user ? (
          <SignInBox />
        ) : (
          <Console butt={butt} buttErr={buttErr} key={user.uid} />
        )}
      </div>
    </div>
  )
}

function TopBar({ helperUp, butt, buttErr }: { helperUp: boolean | null; butt: Butt | null; buttErr: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(t) }, [])
  const live = butt?.connected
  const dot = (ok: boolean | null) => <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-br-gold' : ok === false ? 'bg-br-red' : 'bg-br-dk-muted'}`} />
  return (
    <div className="flex items-center gap-5 px-6 py-3 border-b border-br-dk-border bg-br-dk-surface text-sm">
      <span className="font-display tracking-[0.15em] text-br-dk-text text-lg">Babson Radio Studio</span>
      <span className={`font-display tracking-[0.2em] text-xs px-2.5 py-1 rounded ${live ? 'bg-br-red text-white' : 'bg-br-dk-surface2 text-br-dk-muted'}`}>ON AIR</span>
      <span className="ml-auto flex items-center gap-1.5 text-br-dk-sub">{dot(helperUp)} Helper</span>
      <span className="flex items-center gap-1.5 text-br-dk-sub">{dot(helperUp ? !!butt && !buttErr : null)} BUTT</span>
      <span className="text-br-dk-text tabular-nums">{clock(now)}</span>
    </div>
  )
}

function Notice({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="sk-raised rounded-2xl p-8 max-w-lg w-full text-center space-y-3">
      <h1 className="font-display text-2xl tracking-[0.1em] text-br-dk-text">{title}</h1>
      {text && <p className="text-br-dk-sub">{text}</p>}
      {children}
    </div>
  )
}

function SignInBox() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try { await signIn(email.trim().toLowerCase(), password) } catch (err) { setError(msg(err)); setPassword('') } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="sk-raised rounded-2xl p-8 max-w-md w-full space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display text-3xl tracking-[0.12em] text-br-dk-text">Sign in to go live</h1>
        <p className="text-sm text-br-dk-sub">Use your own Babson Radio account. Every sign-in here is logged.</p>
      </div>
      <Field label="EMAIL" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} />
      <Field label="PASSWORD" type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton busy={busy} type="submit">SIGN IN</PrimaryButton>
    </form>
  )
}

function Console({ butt, buttErr }: { butt: Butt | null; buttErr: string }) {
  const { isGuest } = useAuth()
  const [s, setS] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [songs, setSongs] = useState<{ text: string; at: number }[]>([])
  const [confirmOut, setConfirmOut] = useState(false)
  const sessionRef = useRef('')
  const lastActive = useRef(0)
  const live = !!butt?.connected
  const connecting = !!butt?.connecting

  const refresh = useCallback(async () => {
    const nonce = `${Date.now()}.${crypto.getRandomValues(new Uint32Array(3)).join('').slice(0, 24)}`
    const { sig } = await helper<{ sig: string }>(`/attest?nonce=${encodeURIComponent(nonce)}`)
    const r = await api<Session>('/api/booth/session', { nonce, sig, sessionId: sessionRef.current })
    sessionRef.current = r.sessionId
    setS(r)
    return r
  }, [])

  useEffect(() => {
    if (isGuest) return
    const run = () => refresh().then(() => setError('')).catch(e => setError(msg(e)))
    run()
    const t = setInterval(run, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh, isGuest])

  /** A token that is good for at least another minute. */
  const token = useCallback(async () => {
    const cur = s && s.tokenExp - Date.now() > 60_000 ? s : await refresh()
    return cur.token
  }, [s, refresh])

  const report = useCallback((kind: string, extra: Record<string, unknown> = {}) =>
    sessionRef.current ? api('/api/booth/event', { sessionId: sessionRef.current, kind, ...extra }) : Promise.resolve(), [])

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError('')
    try { await fn() } catch (e) { setError(msg(e)) } finally { setBusy('') }
  }

  const goLive = () => act('live', async () => {
    await helper('/live/start', { token: await token() })
    await report('live_start').catch(() => {})
  })
  const endShow = () => act('stop', async () => {
    await helper('/live/stop', { token: await token() })
    await report('live_stop').catch(() => {})
  })
  const sendSong = (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim(), a = artist.trim()
    if (!t) return setError('Type the song title.')
    return act('song', async () => {
      const text = a ? `${a} - ${t}` : t
      await helper('/song', { token: await token(), text })
      await report('song', { title: t, artist: a }).catch(() => {})
      setSongs(x => [{ text, at: Date.now() }, ...x].slice(0, 30))
      setTitle(''); setArtist('')
    })
  }
  const leave = useCallback(async (kind: 'sign_out' | 'idle_out') => {
    await report(kind).catch(() => {})
    sessionRef.current = ''
    await signOut()
  }, [report])
  const signOutNow = () => act('out', async () => {
    if (live || connecting) {
      await helper('/live/stop', { token: await token() })
      await report('live_stop').catch(() => {})
    }
    await leave('sign_out')
  })

  // Sign out by itself after 10 quiet minutes, but never while on air.
  useEffect(() => {
    const touch = () => { lastActive.current = Date.now() }
    if (!lastActive.current) touch()
    const evs = ['pointerdown', 'keydown'] as const
    evs.forEach(e => window.addEventListener(e, touch))
    const t = setInterval(() => {
      if (!live && !connecting && Date.now() - lastActive.current > IDLE_MS) leave('idle_out').catch(() => {})
    }, 15_000)
    return () => { evs.forEach(e => window.removeEventListener(e, touch)); clearInterval(t) }
  }, [live, connecting, leave])
  useEffect(() => { if (live) lastActive.current = Date.now() }, [live])

  if (isGuest) {
    return (
      <Notice title="Students only" text="Going live is for Babson, Olin and Wellesley students.">
        <button type="button" onClick={() => signOut()} className="sk-btn rounded-xl px-6 py-3 font-display tracking-[0.2em] text-sm">SIGN OUT</button>
      </Notice>
    )
  }

  const level = Math.max(butt?.volumeLeft ?? -90, butt?.volumeRight ?? -90)
  const pct = Math.max(0, Math.min(100, ((level + 60) / 60) * 100))
  const bigBtn = 'w-full rounded-2xl py-6 font-display tracking-[0.25em] text-xl disabled:opacity-50'

  return (
    <div className="w-full max-w-5xl grid gap-6 md:grid-cols-[1.1fr_1fr]">
      <section className="sk-raised rounded-2xl p-7 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-br-dk-sub">Signed in as</p>
            <p className="font-display text-2xl tracking-[0.08em] text-br-dk-text">{s?.name ?? '…'}</p>
          </div>
          {confirmOut ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmOut(false)} className="px-4 py-2 rounded-xl text-sm text-br-dk-sub border border-br-dk-border">Cancel</button>
              <button type="button" onClick={signOutNow} disabled={!!busy} className="px-4 py-2 rounded-xl text-sm bg-br-red text-white">{live ? 'End show and sign out' : 'Sign out'}</button>
            </div>
          ) : (
            <button type="button" onClick={() => (live ? setConfirmOut(true) : signOutNow())} disabled={!!busy}
                    className="px-4 py-2 rounded-xl text-sm text-br-dk-sub border border-br-dk-border hover:text-br-dk-text">Sign out</button>
          )}
        </div>

        <div className="rounded-xl bg-br-dk-surface2 px-5 py-4">
          {s?.show ? (
            <>
              <p className="text-sm text-br-dk-sub">Your show</p>
              <p className="text-lg text-br-dk-text">{s.show.title}</p>
              <p className="text-sm text-br-dk-sub tabular-nums">{clock(s.show.startAt)} – {clock(s.show.endAt)}</p>
            </>
          ) : s?.nextShow ? (
            <>
              <p className="text-sm text-br-dk-sub">Next show</p>
              <p className="text-lg text-br-dk-text">{s.nextShow.title}</p>
              <p className="text-sm text-br-dk-sub tabular-nums">{new Date(s.nextShow.startAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>
            </>
          ) : (
            <p className="text-br-dk-sub">{s ? 'No show on the schedule right now.' : 'Checking your show…'}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className={`font-display tracking-[0.2em] ${live ? 'text-br-red' : 'text-br-dk-sub'}`}>
              {live ? 'ON AIR' : connecting ? 'CONNECTING…' : 'OFF AIR'}
            </span>
            {live && <span className="text-3xl tabular-nums text-br-dk-text">{hms(butt?.streamSeconds ?? 0)}</span>}
          </div>
          <div className="h-3 rounded-full bg-br-dk-surface2 overflow-hidden" aria-label="Input level">
            <div className={`h-full transition-[width] duration-200 ${butt?.silence ? 'bg-br-red' : 'bg-br-gold'}`} style={{ width: `${butt ? pct : 0}%` }} />
          </div>
          {butt?.silence && <p className="text-sm text-br-red">No sound coming into BUTT. Check the mixer.</p>}
          {buttErr && <p className="text-sm text-br-red">BUTT isn&apos;t open. Start BUTT on this PC.</p>}
        </div>

        {live || connecting ? (
          <button type="button" onClick={endShow} disabled={!!busy} className={`${bigBtn} bg-br-red text-white`}>
            {busy === 'stop' ? 'ENDING…' : 'END SHOW'}
          </button>
        ) : (
          <>
            <button type="button" onClick={goLive} disabled={!!busy || !s?.canGoLive || !butt}
                    className={`sk-btn ${bigBtn}`}>{busy === 'live' ? 'GOING LIVE…' : 'GO LIVE'}</button>
            {s && !s.canGoLive && <p className="text-sm text-br-dk-sub text-center">{s.reason}</p>}
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </section>

      <section className="sk-raised rounded-2xl p-7 space-y-5">
        <h2 className="font-display text-xl tracking-[0.12em] text-br-dk-text">Now playing</h2>
        <form onSubmit={sendSong} className="space-y-4">
          <Field label="SONG" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoComplete="off" disabled={!live} />
          <Field label="ARTIST" value={artist} onChange={e => setArtist(e.target.value)} maxLength={120} autoComplete="off" disabled={!live} />
          <PrimaryButton busy={busy === 'song'} type="submit" disabled={!live || !title.trim()}>SEND</PrimaryButton>
        </form>
        {!live && <p className="text-sm text-br-dk-sub">Go live to send songs. Listeners see them on the site and app.</p>}
        {songs.length > 0 && (
          <ul className="divide-y divide-br-dk-border text-sm">
            {songs.map(x => (
              <li key={x.at} className="flex justify-between gap-3 py-2">
                <span className="text-br-dk-text truncate">{x.text}</span>
                <span className="text-br-dk-sub tabular-nums shrink-0">{clock(x.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
