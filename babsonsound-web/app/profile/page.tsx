'use client'

import { CONCENTRATIONS, MAX_CONCENTRATIONS, gradYearOptions } from '@/lib/terms'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import MyRatings from '@/components/MyRatings'
import { api, apiGet, deleteMyAccount, hasPassword, signOut } from '@/lib/auth'
import { Card, ErrorText, Field, GhostButton, PrimaryButton, formatPhone } from '@/components/AuthUI'
import Avatar from '@/components/Avatar'
import { AVATAR_COLORS, discStyle } from '@/lib/profile'
import { normalizeUS } from '@/lib/phone'
import { cleanInstagram } from '@/lib/instagram'
import InstagramLink from '@/components/InstagramLink'

/** How many other members use the same phone number / Instagram handle. A count only, never who. */
function useShared(refresh: unknown) {
  const [n, setN] = useState<{ phone: number; instagram: number }>({ phone: 0, instagram: 0 })
  useEffect(() => { apiGet<{ phone: number; instagram: number }>('/api/me/shared').then(setN).catch(() => {}) }, [refresh])
  return n
}

function SharedWarning({ n, what }: { n: number; what: string }) {
  if (n < 1) return null
  return (
    <p role="status" className="text-sm text-br-gold">
      {n === 1 ? '1 other member is' : `${n} other members are`} using this {what}. If that is not right, change it here.
    </p>
  )
}

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
                  className="sk-key rounded-lg py-2 text-sm font-display tracking-widest text-br-dk-text">
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
  const lab = 'block text-sm text-br-dk-sub mb-1.5 font-display tracking-widest'

  return (
    <form onSubmit={save} className="sk-raised rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-br-dk-text text-sm font-medium">About you</p>
        <p className="text-br-dk-sub text-sm mt-1">All optional.</p>
      </div>
      <label className="block"><span className={lab}>Graduation year</span>
        <select className={box} value={gradYear} onChange={e => setGradYear(e.target.value)}>
          <option value="">Not set</option>
          {[...(gradYear && !gradYearOptions().some(o => o.value === gradYear) ? [{ value: gradYear, label: /^\d{4}$/.test(gradYear) ? `Class of ${gradYear}` : gradYear }] : []), ...gradYearOptions()].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <span className={lab}>Birthday</span>
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
      </div>
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
      <PrimaryButton type="submit" busy={busy}>Save details</PrimaryButton>
    </form>
  )
}

function InstagramEdit() {
  const { reload } = useAuth()
  const [current, setCurrent] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { apiGet<{ instagram?: string }>('/api/me').then(m => setCurrent(m.instagram ?? '')).catch(() => setCurrent('')) }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      const r = await api<{ instagram: string }>('/api/me/instagram', { instagram: text })
      setCurrent(r.instagram); setText(''); setEditing(false); void reload()
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save.') }
    setBusy(false)
  }
  async function remove() {
    setBusy(true); setMsg('')
    try { await api('/api/me/instagram', { remove: true }); setCurrent(''); setEditing(false); void reload() }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not remove it.') }
    setBusy(false)
  }

  const shared = useShared(current)
  if (current === null) return null
  const cleaned = cleanInstagram(text)
  return (
    <div className="space-y-3">
      {current && !editing ? (
        <>
          <p className="text-br-dk-text text-sm"><InstagramLink handle={current} /></p>
          <SharedWarning n={shared.instagram} what="Instagram account" />
          <div className="flex gap-4">
            <GhostButton type="button" onClick={() => { setText(current); setEditing(true) }}>Change</GhostButton>
            <GhostButton type="button" disabled={busy} onClick={remove}>Remove</GhostButton>
          </div>
          {msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
        </>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <Field label="Instagram" value={text} onChange={e => setText(e.target.value)} placeholder="@name or instagram.com link" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={120} />
          {cleaned && <p className="text-sm text-br-dk-text">@{cleaned}</p>}
          {msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
          <PrimaryButton type="submit" busy={busy} disabled={!cleaned}>Save</PrimaryButton>
          {current && <GhostButton type="button" onClick={() => { setEditing(false); setMsg('') }}>Cancel</GhostButton>}
        </form>
      )}
    </div>
  )
}

function PhoneChange() {
  const { reload } = useAuth()
  const [info, setInfo] = useState<{ current: string; pending: { last4: string; at: number } | null } | null>(null)
  const [phone, setPhone] = useState('')
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { apiGet<typeof info>('/api/me/phone').then(setInfo).catch(() => {}) }, [])
  const shared = useShared(info?.current)

  // No number yet: it is saved straight away. A number already on the account: an admin approves the change.
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      const r = await api<{ applied?: boolean; current?: string; pending?: { last4: string; at: number } }>('/api/me/phone', { phone })
      if (r.applied) { setInfo({ current: r.current ?? '', pending: null }); void reload() }
      else setInfo(i => ({ current: i?.current ?? '', pending: r.pending ?? null }))
      setPhone(''); setChanging(false)
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save.') }
    setBusy(false)
  }
  async function cancel() {
    setBusy(true)
    try { await api('/api/me/phone', { cancel: true }); setInfo(i => (i ? { ...i, pending: null } : i)) } catch { /* try again */ }
    setBusy(false)
  }
  async function remove() {
    setBusy(true); setMsg('')
    try { await api('/api/me/phone', { remove: true }); setInfo({ current: '', pending: null }); setChanging(false); void reload() }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not remove it.') }
    setBusy(false)
  }

  const field = (
    <div>
      <span className="block text-sm text-br-dk-sub mb-1.5 font-display tracking-widest">{info?.current ? 'New phone number' : 'Phone number'}</span>
      <div className="sk-field flex items-center rounded-xl pl-4 focus-within:ring-2 focus-within:ring-br-gold/40">
        <span className="text-sm text-br-dk-sub shrink-0" aria-hidden>+1</span>
        <input type="tel" inputMode="tel" autoComplete="tel-national" aria-label="Phone number" placeholder="(617) 555-1234"
               value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
               className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-br-dk-text placeholder:text-br-dk-muted focus:outline-none" />
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {info?.current ? (
        <>
          <p className="text-br-dk-text text-sm">Number ending in {info.current}.</p>
          <SharedWarning n={shared.phone} what="phone number" />
          {info.pending ? (
            <div className="space-y-2">
              <p className="text-sm text-br-dk-sub">Waiting for approval: number ending in {info.pending.last4}.</p>
              <GhostButton type="button" onClick={cancel}>Cancel request</GhostButton>
            </div>
          ) : changing ? (
            <form onSubmit={send} className="space-y-3">
              {field}
              <p className="text-sm text-br-dk-sub">An admin approves changes.</p>
              {msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
              <PrimaryButton type="submit" busy={busy} disabled={!normalizeUS(phone)}>Request change</PrimaryButton>
              <GhostButton type="button" onClick={() => { setChanging(false); setMsg('') }}>Cancel</GhostButton>
            </form>
          ) : (
            <div className="flex gap-4">
              <GhostButton type="button" onClick={() => setChanging(true)}>Change</GhostButton>
              <GhostButton type="button" disabled={busy} onClick={remove}>Remove</GhostButton>
            </div>
          )}
          {!changing && msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
        </>
      ) : (
        <form onSubmit={send} className="space-y-3">
          {field}
          {msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
          <PrimaryButton type="submit" busy={busy} disabled={!normalizeUS(phone)}>Save</PrimaryButton>
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
          {hint && <span className="block text-br-dk-sub text-sm mt-1">{hint}</span>}
        </span>
        <span className="text-br-dk-sub text-sm" aria-hidden>{open ? '–' : '+'}</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

export default function ProfilePage() {
  const { user, userDoc, loading, isBabson, isAdmin, isDirector, reload } = useAuth()
  const router = useRouter()
  const member = isBabson
  const [me, setMe] = useState<{ invisible: boolean; avatarColor: string; joinedAt: number | null; answered: boolean } | null>(null)
  const [hosting, setHosting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<'' | 'color' | 'about' | 'ratings' | 'report' | 'phone' | 'instagram'>('')
  const [showDelete, setShowDelete] = useState(false)
  const [pw, setPw] = useState('')
  const [setupName, setSetupName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !member) return
    apiGet<{ hosting: boolean }>('/api/host/access').then(r => setHosting(r.hosting)).catch(() => {})
  }, [user, member])

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/auth')
  }, [loading, user, router])

  const loadMe = () => apiGet<{ invisible: boolean; avatarColor: string; joinedAt: number | null; gradYear: string; concentrations: string[]; birthday?: unknown }>('/api/me')
    .then(r => setMe({ invisible: r.invisible, avatarColor: r.avatarColor, joinedAt: r.joinedAt, answered: !!(r.gradYear || r.concentrations?.length || r.birthday) })).catch(() => {})
  useEffect(() => { if (user) queueMicrotask(loadMe) }, [user])

  if (loading || !user) return null

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
  const first = userDoc?.firstName || (userDoc ? '' : user.displayName ?? '')
  const needsSetup = !!userDoc && !userDoc.firstName // signed up with just an email: ask for a name and a color now
  async function saveName() {
    const name = setupName.trim()
    if (!name) return setError('Enter your first name.')
    setSaving(true); setError('')
    try { await api('/api/me', { firstName: name }); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setSaving(false)
  }
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
              <p className="text-br-dk-text text-lg leading-tight truncate">{fullName || user.email}</p>
              {userDoc?.username && <p className="text-br-gold text-sm font-display tracking-widest">@{userDoc.username}</p>}
              {since && <p className="text-br-dk-sub text-sm">Member since {since}</p>}
            </div>
          </div>
          {open === 'color' && (
            <div className="flex flex-wrap justify-center gap-3 pt-3 pb-1" role="radiogroup" aria-label="Profile color">
              {AVATAR_COLORS.map(c => (
                <button key={c.id} type="button" role="radio" aria-checked={me?.avatarColor === c.id} aria-label={c.id} onClick={() => pickColor(c.id)}
                        className={`hw-disc h-8 w-8 ${me?.avatarColor === c.id ? 'outline outline-2 outline-offset-2 outline-br-gold' : ''}`} style={discStyle(c.hex)} />
              ))}
            </div>
          )}
        </div>

        {needsSetup && (
          <div className="sk-raised rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-br-dk-text text-sm font-medium">Set up your avatar</p>
              <p className="text-br-dk-sub text-sm mt-1">Add your first name and pick a color.</p>
            </div>
            <Field label="First name" value={setupName} onChange={e => setSetupName(e.target.value)} autoComplete="given-name" placeholder="First name" />
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Profile color">
              {AVATAR_COLORS.map(c => (
                <button key={c.id} type="button" role="radio" aria-checked={me?.avatarColor === c.id} aria-label={c.id} onClick={() => pickColor(c.id)}
                        className={`hw-disc h-8 w-8 ${me?.avatarColor === c.id ? 'outline outline-2 outline-offset-2 outline-br-gold' : ''}`} style={discStyle(c.hex)} />
              ))}
            </div>
            <PrimaryButton type="button" busy={saving} onClick={saveName}>Save</PrimaryButton>
          </div>
        )}

        {member && (
          <Link href="/slots" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Go on air</p>
            <p className="text-br-dk-sub text-sm mt-1">Request airtime.</p>
          </Link>
        )}

        {hosting && (
          <Link href="/host" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Host panel</p>
            <p className="text-br-dk-sub text-sm mt-1">You&apos;re on air soon.</p>
          </Link>
        )}

        {showAbout && <AboutYou onSaved={loadMe} />}

        {member && <Row title="My ratings" open={open === 'ratings'} onToggle={() => toggle('ratings')}><MyRatings /></Row>}

        {member && me && (
          <div className="sk-raised rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-br-dk-text text-sm font-medium">Invisible mode</p>
                <p className="text-br-dk-sub text-sm mt-1">Friends can&apos;t see you tuned in.</p>
              </div>
              <button role="switch" aria-checked={me.invisible} disabled={saving} onClick={toggleInvisible} className="sk-switch shrink-0"><span className="sk-knob" /></button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>

        {aboutLater && <Row title="About you" open={open === 'about'} onToggle={() => toggle('about')}><AboutYou onSaved={loadMe} /></Row>}

        {member && <Row title="Phone number" open={open === 'phone'} onToggle={() => toggle('phone')}><PhoneChange /></Row>}

        {member && <Row title="Instagram" open={open === 'instagram'} onToggle={() => toggle('instagram')}><InstagramEdit /></Row>}

        <Row title="Report a bug or suggest a feature" open={open === 'report'} onToggle={() => toggle('report')}><ReportForm /></Row>

        {(isAdmin || isDirector) && (
          <Link href="/admin" className={rowLink}>
            <p className="text-br-dk-text text-sm font-medium">Admin</p>
          </Link>
        )}

        <div className="text-center space-y-4 pt-2">
          <GhostButton onClick={() => signOut()}>Sign out</GhostButton>
          {!showDelete ? (
            <button className="block mx-auto text-sm text-br-dk-sub hover:text-br-red" onClick={() => setShowDelete(true)}>Delete my account</button>
          ) : (
            <form className="space-y-3 text-left" onSubmit={async e => {
              e.preventDefault(); setBusy(true); setError('')
              try { await deleteMyAccount(pw) } catch (err) { setError(err instanceof Error ? err.message : 'Failed.') }
              setBusy(false)
            }}>
              {hasPassword()
                ? <Field label="Enter your password to permanently delete your account" type="password" value={pw}
                         onChange={e => setPw(e.target.value)} autoComplete="current-password" />
                : <p className="text-sm text-br-dk-sub">This permanently deletes your account.</p>}
              <PrimaryButton type="submit" busy={busy}>Delete forever</PrimaryButton>
            </form>
          )}
        </div>
      </div>
    </Card>
  )
}
