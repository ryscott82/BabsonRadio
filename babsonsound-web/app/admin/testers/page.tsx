'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'
import { BABSON_DOMAIN, SCHOOL_DOMAINS } from '@/lib/auth'

export default function AdminTestersPage() {
  const { user, isHost, loading } = useAuth()
  const router = useRouter()
  const [emails, setEmails] = useState<string[]>([])
  const [text, setText] = useState('')
  const [domain, setDomain] = useState<string>(BABSON_DOMAIN)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setEmails((await apiGet<{ emails: string[] }>('/api/admin/testers')).emails) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the list.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isHost)) router.replace('/') }, [loading, user, isHost, router])
  useEffect(() => { if (user && isHost) queueMicrotask(load) }, [user, isHost, load])

  async function change(list: string[], on: boolean) {
    setBusy(true); setError('')
    try { setEmails((await api<{ emails: string[] }>('/api/admin/testers', { emails: list, on })).emails); if (on) setText('') }
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
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">BETA TESTERS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        Until launch, only these emails can create an account and open the site, with their own login. Testers can use any email domain and get a Report bug / feature button on every page.
        Paste full addresses, or type just the part before the @ to use the school picked below. Several at once is fine.
      </p>
      <div className="sk-raised rounded-xl p-4 space-y-3">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="jsmith1, adoe2, friend@gmail.com"
                  className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" />
        <label className="flex items-center gap-2 text-xs text-br-dk-sub">
          School for names without an @
          <select value={domain} onChange={e => setDomain(e.target.value)} className="sk-field rounded-lg px-2 py-1 text-sm text-br-dk-text">
            {SCHOOL_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
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
