'use client'

import { CONCENTRATIONS, MAX_CONCENTRATIONS, gradYearOptions } from '@/lib/terms'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import MyRatings from '@/components/MyRatings'
import { api, apiGet, deleteMyAccount, signOut } from '@/lib/auth'
import { Card, ErrorText, Field, GhostButton, PrimaryButton, formatPhone } from '@/components/AuthUI'
import Avatar from '@/components/Avatar'
import { AVATAR_COLORS } from '@/lib/profile'

function ReportForm() {
  const [type, setType] = useState<'bug' | 'feature'>('bug')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setNotice('')
    try {
      await api('/api/feedback', { type, message, platform: 'web', page: window.location.pathname })
      setMessage(''); setNotice('Sent. Thank you, we read every one.')
    } catch (error) { setErr(error instanceof Error ? error.message : 'Could not send.') }
    setBusy(false)
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['bug', 'feature'] as const).map(k => (
          <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
                  className="sk-key rounded-lg py-2 text-xs font-display tracking-widest text-br-dk-text">
            {k === 'bug' ? 'SOMETHING IS WRONG' : 'IDEA'}
          </button>
        ))}
      </div>
      <textarea className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" rows={4} maxLength={2000}
                value={message} onChange={e => setMessage(e.target.value)} required
                placeholder={type === 'bug' ? 'What happened? What did you expect?' : 'What would make Babson Radio better?'} />
      <ErrorText>{err}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}
      <PrimaryButton type="submit" busy={busy}>Send</PrimaryButton>
    </form>
  )
}

function AboutYou({ onSaved }: { onSaved?: () => void }) {
  const [gradYear, setGradYear] = useState('')
  const [conc, setConc] = useState<string[]>([])
  const [bMonth, setBMonth] = useState('')
  const [bDay, setBDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    apiGet<{ gradYear: string; concentrations: string[]; birthday?: { month: number; day: number } | null }>('/api/me').then(r => {
      setGradYear(r.gradYear ?? ''); setConc(r.concentrations ?? [])
      setBMonth(r.birthday ? String(r.birthday.month) : ''); setBDay(r.birthday ? String(r.birthday.day) : '')
    }).catch(() => {})
  }, [])

  const setAt = (i: number, v: string) => setConc(c => { const n = [...c]; n[i] = v; return n })
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      await api('/api/me', { gradYear, concentrations: conc.filter(Boolean), birthday: bMonth && bDay ? { month: Number(bMonth), day: Number(bDay) } : null })
      setMsg('Saved.'); onSaved?.()
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save.') }
    setBusy(false)
  }
  const box = 'sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none'
  const lab = 'block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest'

  return (
    <form onSubmit={save} className="sk-raised rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-br-dk-text text-sm font-medium">About you</p>
        <p className="text-br-dk-sub text-xs mt-1">All optional.</p>
      </div>
      <label className="block"><span className={lab}>Graduation year</span>
        <select className={box} value={gradYear} onChange={e => setGradYear(e.target.value)}>
          <option value="">Not set</option>
          {gradYearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></label>
      {CONCENTRATIONS.length ? (
        Array.from({ length: MAX_CONCENTRATIONS }, (_, i) => (
          <label key={i} className="block"><span className={lab}>{i ? 'SECOND CONCENTRATION' : 'CONCENTRATION'}</span>
            <select className={box} value={conc[i] ?? ''} onChange={e => setAt(i, e.target.value)}>
              <option value="">Not set</option>
              {CONCENTRATIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select></label>
        ))
      ) : (
        <Field label="Concentration" value={conc[0] ?? ''} maxLength={60} onChange={e => setConc([e.target.value])} placeholder="Entrepreneurship" />
      )}
      <div>
        <span className={lab}>Birthday (optional)</span>
        <div className="flex gap-3">
          <select className={box} aria-label="Birthday month" value={bMonth} onChange={e => setBMonth(e.target.value)}>
            <option value="">Month</option>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className={box} aria-label="Birthday day" value={bDay} onChange={e => setBDay(e.target.value)}>
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
        <p className="text-xs text-br-dk-sub mt-1.5">Only used for a birthday notification and so the DJ knows. We never ask for the year.</p>
      </div>
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
      <PrimaryButton type="submit" busy={busy}>Save details</PrimaryButton>
    </form>
  )
}

function PhoneChange() {
  const [info, setInfo] = useState<{ current: string; pending: { last4: string; at: number } | null } | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { apiGet<typeof info>('/api/me/phone').then(setInfo).catch(() => {}) }, [])

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      const r = await api<{ pending: { last4: string; at: number } }>('/api/me/phone', { phone })
      setInfo(i => ({ current: i?.current ?? '', pending: r.pending })); setPhone('')
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not send.') }
    setBusy(false)
  }
  async function cancel() {
    setBusy(true)
    try { await api('/api/me/phone', { cancel: true }); setInfo(i => (i ? { ...i, pending: null } : i)) } catch { /* try again */ }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-br-dk-sub text-xs">{info?.current ? `Current number ends in ${info.current}.` : ''} An admin approves changes.</p>
      {info?.pending ? (
        <div className="space-y-2">
          <p className="text-sm text-br-dk-text">Waiting for approval: number ending in {info.pending.last4}.</p>
          <GhostButton type="button" onClick={cancel}>Cancel request</GhostButton>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <Field label="New phone number" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(617) 555-1234" inputMode="tel" autoComplete="tel-national" />
          {msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
          <PrimaryButton type="submit" busy={busy}>Request change</PrimaryButton>
        </form>
      )}
    </div>
  )
}

/** A tappable row that opens its content in place. */
function Row({ title, hint, open, onToggle, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className="sk-raised rounded-2xl">
      <button type="button" aria-expanded={open} onClick={onToggle} className="w-full flex items-center justify-between gap-4 p-5 text-left">
        <span>
          <span className="block text-br-dk-text text-sm font-medium">{title}</span>
          {hint && <span className="block text-br-dk-sub text-xs mt-1">{hint}</span>}
        </span>
        <span className="text-br-dk-sub text-sm" aria-hidden>{open ? '–' : '+'}</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

export default function ProfilePage() {
  const { user, userDoc, loading, isBabson, isDeveloper, isGuest, isAdmin, isDirector } = useAuth()
  const router = useRouter()
  const member = isBabson || isDeveloper
  const [me, setMe] = useState<{ invisible: boolean; avatarColor: string; joinedAt: number | null; answered: boolean } | null>(null)
  const [hosting, setHosting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<'' | 'color' | 'about' | 'ratings' | 'report' | 'phone'>('')
  const [showDelete, setShowDelete] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!user || !member) return
    apiGet<{ hosting: boolean }>('/api/host/access').then(r => setHosting(r.hosting)).catch(() => {})
  }, [user, member])

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/auth')
    else if (isGuest) router.replace('/auth/guest')
  }, [loading, user, isGuest, router])

  const loadMe = () => apiGet<{ invisible: boolean; avatarColor: string; joinedAt: number | null; gradYear: string; concentrations: string[]; birthday?: unknown }>('/api/me')
    .then(r => setMe({ invisible: r.invisible, avatarColor: r.avatarColor, joinedAt: r.joinedAt, answered: !!(r.gradYear || r.concentrations?.length || r.birthday) })).catch(() => {})
  useEffect(() => { if (user && !isGuest) queueMicrotask(loadMe) }, [user, isGuest])

  if (loading || !user || isGuest) return null

  async function toggleInvisible() {
    if (!me) return
    setSaving(true); setError('')
    const next = !me.invisible
    setMe({ ...me, invisible: next })
    try { await api('/api/me', { invisible: next }) }
    catch (e) { setMe({ ...me, invisible: !next }); setError(e instanceof Error ? e.message : 'Could not save.') }
    setSaving(false)
  }
  async function pickColor(id: string) {
    if (!me) return
    const prev = me.avatarColor
    setMe({ ...me, avatarColor: id }); setError('')
    try { await api('/api/me', { avatarColor: id }) } catch (e) { setMe(m => (m ? { ...m, avatarColor: prev } : m)); setError(e instanceof Error ? e.message : 'Could not save.') }
  }
  async function invite() {
    const url = 'https://babsonradio.com'
    try {
      if (navigator.share) await navigator.share({ title: 'Babson Radio', url })
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2_000) }
    } catch { /* cancelled */ }
  }

  const first = userDoc?.firstName ?? userDoc?.displayName ?? user.displayName ?? ''
  const fullName = [first, userDoc?.lastName].filter(Boolean).join(' ')
  const since = me?.joinedAt ? new Date(me.joinedAt).toLocaleDateString([], { month: 'long', year: 'numeric' }) : ''
  const toggle = (k: typeof open) => setOpen(o => (o === k ? '' : k))
  const rowLink = 'block sk-raised rounded-2xl p-5'
  const showAbout = member && me != null && !me.answered
  const aboutLater = member && me != null && me.answered

  return (
    <Card title="Your profile">
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Change profile color" aria-expanded={open === 'color'} onClick={() => toggle('color')} className="rounded-full shrink-0">
              <Avatar name={fullName || first} color={me?.avatarColor} size={64} />
            </button>
            <div className="min-w-0">
              <p className="text-br-dk-text text-lg leading-tight truncate">{fullName}</p>
              {userDoc?.username && <p className="text-br-gold text-sm font-display tracking-widest">@{userDoc.username}</p>}
              {since && <p className="text-br-dk-sub text-sm">Member since {since}</p>}
            </div>
          </div>
          {open === 'color' && (
            <div className="flex flex-wrap justify-center gap-3 pt-3 pb-1" role="radiogroup" aria-label="Profile color">
              {AVATAR_COLORS.map(c => (
                <button key={c.id} type="button" role="radio" aria-checked={me?.avatarColor === c.id} aria-label={c.id} onClick={() => pickColor(c.id)}
                        className={`h-8 w-8 rounded-full ${me?.avatarColor === c.id ? 'ring-2 ring-offset-2 ring-br-gold ring-offset-br-dk-bg' : ''}`} style={{ background: c.hex }} />
              ))}
            </div>
          )}
        </div>

        {member && (
          <Link href="/slots" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Go on air</p>
            <p className="text-br-dk-sub text-xs mt-1">Request airtime.</p>
          </Link>
        )}

        {hosting && (
          <Link href="/host" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Host panel</p>
            <p className="text-br-dk-sub text-xs mt-1">You&apos;re on air soon.</p>
          </Link>
        )}

        {showAbout && <AboutYou onSaved={loadMe} />}

        {isBabson && (
          <Link href="/guest-access" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Invite friends</p>
            <p className="text-br-dk-sub text-xs mt-1">Friends you invite get guest access automatically.</p>
          </Link>
        )}

        {member && !isBabson && (
          <button type="button" onClick={invite} className={`${rowLink} w-full text-left`}>
            <p className="text-br-dk-text text-sm font-medium">Invite friends</p>
            {copied && <p className="text-br-gold text-xs mt-1">Link copied.</p>}
          </button>
        )}

        {member && <Row title="My ratings" open={open === 'ratings'} onToggle={() => toggle('ratings')}><MyRatings /></Row>}

        {member && me && (
          <div className="sk-raised rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-br-dk-text text-sm font-medium">Invisible mode</p>
                <p className="text-br-dk-sub text-xs mt-1">Friends can&apos;t see you tuned in. Reactions and contact suggestions are off.</p>
              </div>
              <button role="switch" aria-checked={me.invisible} disabled={saving} onClick={toggleInvisible} className="sk-switch shrink-0"><span className="sk-knob" /></button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>

        {aboutLater && <Row title="About you" open={open === 'about'} onToggle={() => toggle('about')}><AboutYou onSaved={loadMe} /></Row>}

        {member && <Row title="Phone number" open={open === 'phone'} onToggle={() => toggle('phone')}><PhoneChange /></Row>}

        <Row title="Report a bug or suggest a feature" open={open === 'report'} onToggle={() => toggle('report')}><ReportForm /></Row>

        {(isAdmin || isDirector) && (
          <Link href="/admin" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Admin</p>
          </Link>
        )}

        <div className="text-center space-y-4 pt-2">
          <GhostButton onClick={() => signOut()}>Sign out</GhostButton>
          {!showDelete ? (
            <button className="block mx-auto text-xs text-br-dk-sub hover:text-br-red" onClick={() => setShowDelete(true)}>Delete my account</button>
          ) : (
            <form className="space-y-3 text-left" onSubmit={async e => {
              e.preventDefault(); setBusy(true); setError('')
              try { await deleteMyAccount(pw) } catch (err) { setError(err instanceof Error ? err.message : 'Failed.') }
              setBusy(false)
            }}>
              <Field label="Enter your password to permanently delete your account" type="password" value={pw}
                     onChange={e => setPw(e.target.value)} autoComplete="current-password" />
              <PrimaryButton type="submit" busy={busy}>Delete forever</PrimaryButton>
            </form>
          )}
        </div>
      </div>
    </Card>
  )
}
