'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'
import { BABSON_DOMAIN, SCHOOL_DOMAINS } from '@/lib/auth'

async function fetchPut(uid: string, decision: string) {
  const { getAuth } = await import('firebase/auth')
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch('/api/admin/testers', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, decision, welcome: true }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not save.')
}

export default function AdminTestersPage() {
  const { user, isHost, loading } = useAuth()
  const router = useRouter()
  const [emails, setEmails] = useState<string[]>([])
  const [requests, setRequests] = useState<{ uid: string; email: string; name: string; joinedAt: number }[]>([])
  const [text, setText] = useState('')
  const [domain, setDomain] = useState<string>(BABSON_DOMAIN)
  const [welcome, setWelcome] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { const r = await apiGet<{ emails: string[]; requests: typeof requests }>('/api/admin/testers'); setEmails(r.emails); setRequests(r.requests) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the list.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isHost)) router.replace('/') }, [loading, user, isHost, router])
  useEffect(() => { if (user && isHost) queueMicrotask(load) }, [user, isHost, load])

  async function change(list: string[], on: boolean) {
    setBusy(true); setError('')
    setNote('')
    try {
      const r = await api<{ emails: string[]; mail?: string }>('/api/admin/testers', { emails: list, on, welcome })
      setEmails(r.emails)
      if (on) { setText(''); setNote(r.mail === 'not-set-up' ? 'Added. Email is not set up yet (RESEND_API_KEY), so nothing was sent.' : r.mail === 'sending' ? 'Added. Welcome emails are going out.' : '') }
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  async function decide(uid: string, decision: 'approve' | 'deny') {
    setBusy(true); setError('')
    try { await fetchPut(uid, decision); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  if (!user || !isHost) return null
  // Accept "ryan" (uses the school picked below), "ryan@olin.edu", commas, spaces or one per line.
  const parsed = text.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    .map(s => (s.includes('@') ? s : `${s}${domain}`))

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Beta testers</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        Until launch, only these emails can open the site. Anyone else who makes an account lands in the waiting list below until you approve them. Testers can use any email domain and get a Report bug / feature button on every page.
        Paste full addresses, or type just the part before the @ to use the school picked below. Several at once is fine.
      </p>
      {requests.length > 0 && (
        <div className="sk-raised rounded-xl p-4 space-y-3">
          <p className="font-display tracking-widest text-xs text-br-gold">{requests.length} WAITING FOR APPROVAL</p>
          <p className="text-xs text-br-dk-sub">These people made an account without being on the list. They can&apos;t use anything until you approve them.</p>
          {requests.map(r => (
            <div key={r.uid} className="sk-field rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-sm text-br-dk-text truncate">{r.name || '(no name)'} · {r.email}</span>
              <span className="flex gap-3 shrink-0">
                <button className="text-xs text-br-gold" disabled={busy} onClick={() => decide(r.uid, 'approve')}>Approve</button>
                <button className="text-xs text-br-red" disabled={busy} onClick={() => decide(r.uid, 'deny')}>Deny</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="sk-raised rounded-xl p-4 space-y-3">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="jsmith1, adoe2, friend@gmail.com"
                  className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" />
        <label className="flex items-center gap-2 text-xs text-br-dk-sub">
          School for names without an @
          <select value={domain} onChange={e => setDomain(e.target.value)} className="sk-field rounded-lg px-2 py-1 text-sm text-br-dk-text">
            {SCHOOL_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-br-dk-sub">
          <input type="checkbox" checked={welcome} onChange={e => setWelcome(e.target.checked)} />
          Email them that they&apos;ve been selected (once per address)
        </label>
        {note && <p role="status" className="text-xs text-br-gold">{note}</p>}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="button" busy={busy} onClick={() => parsed.length && change(parsed, true)}>
          {parsed.length > 1 ? `ADD ${parsed.length} TESTERS` : 'ADD TESTER'}
        </PrimaryButton>
      </div>
      <div className="space-y-2">
        <p className="font-display tracking-widest text-xs text-br-gold">{emails.length} ALLOWED</p>
        {emails.length === 0 && <p className="text-sm text-br-dk-sub">Nobody yet.</p>}
        {emails.map(e => (
          <div key={e} className="sk-field rounded-lg px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-sm text-br-dk-text truncate">{e}</span>
            <button className="text-xs text-br-red shrink-0" onClick={() => change([e], false)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}
