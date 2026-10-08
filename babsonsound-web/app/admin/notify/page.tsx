'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'

interface H { id: string; title: string; body: string; at: number; sent: number; by: string }

export default function AdminNotifyPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [phones, setPhones] = useState(0)
  const [history, setHistory] = useState<H[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try { const r = await apiGet<{ phones: number; history: H[] }>('/api/admin/broadcast'); setPhones(r.phones); setHistory(r.history) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMsg('')
    try {
      const r = await api<{ sent: number }>('/api/admin/broadcast', { title, body })
      setMsg(`Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}.`); setTitle(''); setBody(''); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send.') }
    setBusy(false)
  }

  if (!user || !isAdmin) return null
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">SEND A NOTIFICATION</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        Goes to every phone that turned on station announcements in the app ({phones} right now). Use it for live events and big news. It can&apos;t be undone, so check the wording first.
      </p>
      <form onSubmit={send} className="sk-raised rounded-xl p-4 space-y-3">
        <Field label="Title" value={title} maxLength={60} onChange={e => setTitle(e.target.value)} placeholder="Live from the quad" />
        <Field label="Message" value={body} maxLength={160} onChange={e => setBody(e.target.value)} placeholder="Tune in at 6 for a live set from…" />
        <ErrorText>{error}</ErrorText>
        {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
        <PrimaryButton type="submit" busy={busy}>SEND TO EVERYONE</PrimaryButton>
      </form>
      <div className="space-y-2">
        {history.map(h => (
          <div key={h.id} className="sk-raised rounded-xl px-4 py-3">
            <p className="text-sm text-br-dk-text">{h.title}</p>
            <p className="text-xs text-br-dk-sub">{h.body}</p>
            <p className="text-xs text-br-dk-muted mt-1">{new Date(h.at).toLocaleString()} · {h.sent} phone{h.sent === 1 ? '' : 's'}{h.by ? ` · ${h.by}` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
