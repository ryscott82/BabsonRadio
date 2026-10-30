'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet, resendVerification, signOut } from '@/lib/auth'
import { sharedAudio } from '@/lib/spectrum'
import { judgeAge } from '@/lib/age'
import { normalizeUS } from '@/lib/phone'
import { cleanInstagram } from '@/lib/instagram'
import { InstagramIcon } from '@/components/InstagramLink'
import { AVATAR_COLORS, discStyle } from '@/lib/profile'
import { gradYearOptions } from '@/lib/terms'
import type { SetupState } from '@/lib/setup'
import type { PromptStep } from '@/lib/setup-ui'
import { ErrorText, Field, formatPhone } from '@/components/AuthUI'

// One small modal, at most once per visit, asking for the single next setup step the server picked (setup.next).
// It waits for the first tap or the next page navigation, and never opens on the home page (the player's controls are there),
// on sign-in and policy pages, over another dialog or the full-screen board, or while the stream is starting.

const QUIET = ['/', '/auth', '/privacy', '/terms', '/unsubscribe', '/delete-account', '/coming-soon', '/admin']
const quiet = (p: string) => QUIET.some(q => (q === '/' ? p === '/' : p === q || p.startsWith(`${q}/`)))

/** The stream is starting: audio was asked to play but has not got enough data yet. */
const streamStarting = () => { const a = sharedAudio(); return !!a && !a.paused && !a.ended && a.readyState < 3 }
const anotherDialogOpen = () => !!document.querySelector('[role="dialog"], .hw-board-title')

const RANGES = [['under13', 'Under 13'], ['13-17', '13 to 17'], ['18-24', '18 to 24'], ['25plus', '25 or older']] as const
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const box = 'sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none'

export default function SetupPrompt() {
  const { user, setup, applySetup, reload } = useAuth()
  const pathname = usePathname()
  const [step, setStep] = useState<PromptStep | null>(null)
  const next = setup?.next ?? null
  const shown = useRef(false)          // the automatic prompt already came up this visit
  const armed = useRef(false)          // the first tap or a page change has happened
  const startPath = useRef<string | null>(null)
  const live = useRef({ next, pathname, user: !!user })
  useEffect(() => { live.current = { next, pathname, user: !!user } })

  // Show the step if every rule allows it right now; otherwise stay armed and try again on the next tap or page change.
  const tryShow = useRef(() => {})
  useEffect(() => {
    tryShow.current = () => {
      const { next: n, pathname: p, user: u } = live.current
      if (!u || !n || n === 'verifyEmail' || shown.current || !armed.current || quiet(p)) return
      if (document.hidden || streamStarting() || anotherDialogOpen()) return
      shown.current = true
      apiGet('/api/me?prompt=1').catch(() => {}) // records that a prompt went out, so nothing else is offered for 30 minutes
      setStep(n)
    }
  })

  useEffect(() => {
    if (startPath.current === null) { startPath.current = pathname; return }
    armed.current = true // a page change counts
    const t = setTimeout(() => tryShow.current(), 600)
    return () => clearTimeout(t)
  }, [pathname])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const tap = () => { armed.current = true; clearTimeout(t); t = setTimeout(() => tryShow.current(), 600) }
    window.addEventListener('pointerdown', tap, { capture: true, passive: true })
    return () => { window.removeEventListener('pointerdown', tap, { capture: true }); clearTimeout(t) }
  }, [])

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
  const { user, userDoc } = useAuth()
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
  const [year, setYear] = useState(''); const [month, setMonth] = useState(''); const [day, setDay] = useState('')
  const [useRange, setUseRange] = useState(false); const [range, setRange] = useState('')
  const [consent, setConsent] = useState(false)
  // grad year, phone
  const [grad, setGrad] = useState('')
  const [phone, setPhone] = useState('')
  const [insta, setInsta] = useState('')

  useEffect(() => {
    first.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') notNow() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verdict = (() => {
    if (step !== 'birthday') return null
    if (useRange) return range === 'under13' ? 'under13' : range === '13-17' ? 'minor' : range ? 'adult' : null
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
      case 'birthday': return send('/api/me/setup', { step, value: { ...(useRange ? { ageRange: range } : { year, month, day }), parentalConsent: consent } })
      case 'gradYear': return send('/api/me/setup', { step, value: { gradYear: grad } })
      case 'phone': return send('/api/me/setup', { step, value: { phone } })
      case 'instagram': return send('/api/me/setup', { step, value: { instagram: insta } })
    }
  }
  function notNow() {
    if (step === 'verify') return close()
    setBusy(true)
    api<{ setup: SetupState }>('/api/me/setup/skip', { step }).then(r => done(r.setup)).catch(() => close())
  }

  const ready = step === 'name' ? name.trim().length > 0
    : step === 'avatar' ? !!color
    : step === 'birthday' ? (useRange ? !!range : !!year && verdict !== 'ask-more' && verdict !== 'invalid') && !(needConsent && !consent)
    : step === 'gradYear' ? !!grad
    : step === 'phone' ? !!normalizeUS(phone)
    : step === 'instagram' ? !!cleanInstagram(insta)
    : false

  const title: Record<PromptStep, string> = {
    name: "What's your name?", avatar: 'Pick your color', birthday: 'When were you born?', gradYear: 'Graduation year',
    phone: 'Phone number (optional)', instagram: 'Instagram (optional)', verify: 'Verify your email',
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
            {useRange ? (
              <select className={box} aria-label="Age range" value={range} onChange={e => setRange(e.target.value)}>
                <option value="">Age range</option>
                {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <>
                <select className={box} aria-label="Birth year" value={year} onChange={e => setYear(e.target.value)}>
                  <option value="">Year</option>
                  {Array.from({ length: new Date().getFullYear() - 1930 - 9 }, (_, i) => new Date().getFullYear() - 10 - i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="flex gap-3">
                  <select className={box} aria-label="Birth month (optional)" value={month} onChange={e => setMonth(e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select className={box} aria-label="Birth day (optional)" value={day} onChange={e => setDay(e.target.value)}>
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
                <p className="text-sm text-br-dk-sub">Month and day are optional.</p>
              </>
            )}
            {verdict === 'ask-more' && <p className="text-sm text-br-dk-text">Add your month and day.</p>}
            {verdict === 'under13' && <p className="text-sm text-br-red">Babson Radio is for ages 13 and up. Saving deletes this account.</p>}
            {needConsent && (
              <label className="flex items-start gap-3 text-sm text-br-dk-text">
                <input type="checkbox" className="mt-0.5" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span>A parent or guardian is okay with me using Babson Radio.</span>
              </label>
            )}
            <button type="button" className="text-sm text-br-dk-sub underline underline-offset-4 hover:text-br-dk-text"
                    onClick={() => { setUseRange(v => !v); setErr(''); setConsent(false) }}>
              {useRange ? 'Use birthday instead' : 'Use age range instead'}
            </button>
          </div>
        )}

        {step === 'gradYear' && (
          <select className={box} aria-label="Graduation year" value={grad} onChange={e => setGrad(e.target.value)}>
            <option value="">Select</option>
            {gradYearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <p className="text-sm text-br-dk-sub">This is optional, but unlocks new features</p>
            <div className="sk-field flex items-center rounded-xl pl-4 focus-within:ring-2 focus-within:ring-br-gold/40">
              <span className="text-sm text-br-dk-sub shrink-0" aria-hidden>+1</span>
              <input type="tel" inputMode="tel" autoComplete="tel-national" aria-label="Phone number (optional)" placeholder="(617) 555-1234"
                     value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                     className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-br-dk-text placeholder:text-br-dk-muted focus:outline-none" />
            </div>
          </div>
        )}

        {step === 'instagram' && (
          <div className="space-y-2">
            <div className="sk-field flex items-center rounded-xl pl-4 focus-within:ring-2 focus-within:ring-br-gold/40">
              <InstagramIcon className="h-4 w-4 shrink-0 text-br-dk-sub" />
              <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Instagram (optional)" placeholder="@name or instagram.com link"
                     value={insta} onChange={e => setInsta(e.target.value)} maxLength={120}
                     className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-br-dk-text placeholder:text-br-dk-muted focus:outline-none" />
            </div>
            {cleanInstagram(insta) && <p className="text-sm text-br-dk-text">@{cleanInstagram(insta)}</p>}
          </div>
        )}

        {step === 'verify' && (
          <p className="text-sm text-br-dk-sub">We sent a link to {user?.email ?? 'your email'}.{sent ? ' Sent again.' : ''}</p>
        )}

        <div className="mt-4"><ErrorText>{err}</ErrorText></div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" disabled={busy} onClick={notNow} className="sk-key rounded-xl px-5 py-3 text-sm disabled:opacity-50">Not now</button>
          {step === 'verify' ? (
            <span className="flex gap-2">
              <button type="button" className="sk-key rounded-xl px-4 py-3 text-sm"
                      onClick={async () => { try { await resendVerification(); setSent(true); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Try again in a minute.') } }}>Resend</button>
              <button type="button" className="sk-btn rounded-xl px-4 py-3 text-sm" onClick={async () => { await reload(); close() }}>I verified</button>
            </span>
          ) : (
            <button type="button" disabled={busy || !ready} onClick={save} className="sk-btn rounded-xl px-8 py-3 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
