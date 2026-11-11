'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, resendVerification, signOut } from '@/lib/auth'
import { sharedAudio } from '@/lib/spectrum'
import { judgeAge } from '@/lib/age'
import { normalizeUS } from '@/lib/phone'
import { AVATAR_COLORS, discStyle } from '@/lib/profile'
import { gradYearOptions } from '@/lib/terms'
import type { SetupState } from '@/lib/setup'
import type { PromptStep } from '@/lib/setup-ui'
import { ErrorText, Field, formatPhone } from '@/components/AuthUI'

// One small modal, every time someone signs in or opens the site, asking for the single next setup step the server picked (setup.next).
// The name cannot be dismissed. Anything else can be: it goes to the back of the line and comes up again on a later visit.
// It holds off on sign-in and policy pages, over another dialog or the full-screen board, and while the stream is starting.

const QUIET = ['/auth', '/privacy', '/terms', '/support', '/unsubscribe', '/delete-account', '/coming-soon', '/admin', '/booth']
const quiet = (p: string) => QUIET.some(q => p === q || p.startsWith(`${q}/`))

/** The stream is starting: audio was asked to play but has not got enough data yet. */
const streamStarting = () => { const a = sharedAudio(); return !!a && !a.paused && !a.ended && a.readyState < 3 }
const anotherDialogOpen = () => !!document.querySelector('[role="dialog"], .hw-board-title')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const box = 'sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none'

export default function SetupPrompt() {
  const { user, setup, applySetup, reload } = useAuth()
  const pathname = usePathname()
  const [step, setStep] = useState<PromptStep | null>(null)
  const next = setup?.next ?? null
  const uid = user?.uid ?? null
  const shown = useRef(false)          // this visit's prompt already came up
  const live = useRef({ next, pathname })
  useEffect(() => { live.current = { next, pathname } })

  // A new sign-in is a new visit.
  useEffect(() => { shown.current = false; queueMicrotask(() => setStep(null)) }, [uid])

  // Look every second or so until the prompt can come up without getting in the way.
  useEffect(() => {
    if (!uid) return
    const t = setInterval(() => {
      const { next: n, pathname: p } = live.current
      if (shown.current || !n || n === 'verifyEmail' || quiet(p)) return
      if (document.hidden || streamStarting() || anotherDialogOpen()) return
      shown.current = true
      setStep(n)
    }, 1200)
    return () => clearInterval(t)
  }, [uid])

  // The banner asks for a step directly.
  useEffect(() => {
    const open = (e: Event) => {
      const want = (e as CustomEvent<PromptStep | undefined>).detail
      const n = live.current.next
      shown.current = true
      setStep(want ?? (n && n !== 'verifyEmail' ? n : null))
    }
    window.addEventListener('br:setup-open', open)
    return () => window.removeEventListener('br:setup-open', open)
  }, [])

  if (!user || !step) return null
  const done = (s?: SetupState) => { if (s) applySetup(s); setStep(null) }
  return <Modal step={step} done={done} close={() => setStep(null)} reload={reload} />
}

function Modal({ step, done, close, reload }: { step: PromptStep; done: (s?: SetupState) => void; close: () => void; reload: () => Promise<void> }) {
  const { user, userDoc, setup } = useAuth()
  const router = useRouter()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const first = useRef<HTMLDivElement>(null)

  // name
  const [name, setName] = useState([userDoc?.firstName, userDoc?.lastName].filter((x): x is string => typeof x === 'string' && !!x).join(' '))
  // avatar
  const [color, setColor] = useState('')
  // birthday
  const [year, setYear] = useState(String(new Date().getFullYear() - 18)); const [month, setMonth] = useState(''); const [day, setDay] = useState('')
  const [consent, setConsent] = useState(false)
  // grad year, phone
  const [grad, setGrad] = useState(setup?.gradGuess ?? '')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    first.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'name') notNow() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verdict = (() => {
    if (step !== 'birthday') return null
    if (!year) return null
    return judgeAge(Number(year), month && day ? Number(month) : null, month && day ? Number(day) : null).kind
  })()
  const needConsent = verdict === 'minor'

  async function send(path: string, body: unknown) {
    setBusy(true); setErr('')
    try { const r = await api<{ setup: SetupState }>(path, body); done(r.setup) }
    catch (e) {
      const m = e instanceof Error ? e.message : 'Could not save. Try again.'
      if (m.includes('BR-AGE-001')) { await signOut().catch(() => {}); router.replace('/'); return }
      setErr(m); setBusy(false)
    }
  }
  const save = () => {
    switch (step) {
      case 'name': return send('/api/me/setup', { step, value: { name } })
      case 'avatar': return send('/api/me/setup', { step, value: { avatarColor: color } })
      case 'birthday': return send('/api/me/setup', { step, value: { year, month, day, parentalConsent: consent } })
      case 'gradYear': return send('/api/me/setup', { step, value: { gradYear: grad } })
      case 'phone': return send('/api/me/setup', { step, value: { phone } })
    }
  }
  function notNow() {
    if (step === 'verify') return close()
    setBusy(true)
    api<{ setup: SetupState }>('/api/me/setup/skip', { step }).then(r => done(r.setup)).catch(() => close())
  }

  const ready = step === 'name' ? name.trim().length > 0
    : step === 'avatar' ? !!color
    : step === 'birthday' ? (!!year && verdict !== 'ask-more' && verdict !== 'invalid') && !(needConsent && !consent)
    : step === 'gradYear' ? !!grad
    : step === 'phone' ? !!normalizeUS(phone)
    : false

  const title: Record<PromptStep, string> = {
    name: "What's your name?", avatar: 'Pick your color', birthday: 'When were you born?', gradYear: 'Graduation year',
    phone: 'Phone number', verify: 'Verify your email',
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 bg-black/60">
      <div ref={first} role="dialog" aria-modal="true" aria-labelledby="setup-title" className="sk-raised rounded-2xl p-6 w-full max-w-sm">
        <h2 id="setup-title" className="font-display text-br-dk-text text-2xl mb-4">{title[step]}</h2>

        {step === 'name' && (
          <div className="space-y-3">
            <Field label="Name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={100} />
          </div>
        )}

        {step === 'avatar' && (
          <div className="flex flex-wrap justify-center gap-3 py-1" role="radiogroup" aria-label="Profile color">
            {AVATAR_COLORS.map(c => (
              <button key={c.id} type="button" role="radio" aria-checked={color === c.id} aria-label={c.id.replace(/-/g, ' ')} onClick={() => setColor(c.id)}
                      className={`hw-disc h-9 w-9 ${color === c.id ? 'outline outline-2 outline-offset-2 outline-br-gold' : ''}`} style={discStyle(c.hex)} />
            ))}
          </div>
        )}

        {step === 'birthday' && (
          <div className="space-y-3">
            <select className={box} aria-label="Birth year" value={year} onChange={e => setYear(e.target.value)}>
              {Array.from({ length: new Date().getFullYear() - 1930 - 9 }, (_, i) => new Date().getFullYear() - 10 - i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-3">
              <select className={box} aria-label="Birth month" value={month} onChange={e => setMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select className={box} aria-label="Birth day" value={day} onChange={e => setDay(e.target.value)}>
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
            {verdict === 'ask-more' && <p className="text-sm text-br-dk-text">Add your month and day.</p>}
            {verdict === 'under13' && <p className="text-sm text-br-red">Babson Radio is for ages 13 and up. Saving deletes this account.</p>}
            {needConsent && (
              <label className="flex items-start gap-3 text-sm text-br-dk-text">
                <input type="checkbox" className="mt-0.5" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span>A parent or guardian is okay with me using Babson Radio.</span>
              </label>
            )}
          </div>
        )}

        {step === 'gradYear' && (
          <select className={box} aria-label="Graduation year" value={grad} onChange={e => setGrad(e.target.value)}>
            {!grad && <option value="">Select</option>}
            {gradYearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <div className="sk-field flex items-center rounded-xl pl-4 focus-within:ring-2 focus-within:ring-br-gold/40">
              <span className="text-sm text-br-dk-sub shrink-0" aria-hidden>+1</span>
              <input type="tel" inputMode="tel" autoComplete="tel-national" aria-label="Phone number" placeholder="(617) 555-1234"
                     value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                     className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-br-dk-text placeholder:text-br-dk-muted focus:outline-none" />
            </div>
          </div>
        )}

        {step === 'verify' && (
          <p className="text-sm text-br-dk-sub">We sent a link to {user?.email ?? 'your email'}.{sent ? ' Sent again.' : ''}</p>
        )}

        <div className="mt-4"><ErrorText>{err}</ErrorText></div>

        <div className="mt-5 flex items-center justify-between gap-3">
          {step === 'name' ? <span /> : <button type="button" disabled={busy} onClick={notNow} className="sk-key rounded-xl px-5 py-3 text-sm disabled:opacity-50">Not now</button>}
          {step === 'verify' ? (
            <span className="flex gap-2">
              <button type="button" className="sk-key rounded-xl px-4 py-3 text-sm"
                      onClick={async () => { try { await resendVerification(); setSent(true); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Try again in a minute.') } }}>Resend</button>
              <button type="button" className="sk-btn rounded-xl px-4 py-3 text-sm" onClick={async () => { await reload(); close() }}>I verified</button>
            </span>
          ) : (
            <button type="button" disabled={busy || !ready} onClick={save} className="sk-btn rounded-xl px-8 py-3 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Next'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
