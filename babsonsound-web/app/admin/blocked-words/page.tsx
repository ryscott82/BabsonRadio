'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

export default function BlockedWordsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<{ words: string[] }>('/api/admin/blocked-words').then(r => { setText(r.words.join('\n')); setLoaded(true) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const words = text.split(/[\n,]/).map(w => w.trim()).filter(Boolean)
      const r = await api<{ words: string[] }>('/api/admin/blocked-words', { words })
      setText(r.words.join('\n')); setNotice('Saved.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  if (loading || !isAdmin) return null
  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">BLOCKED WORDS</h1>
      <p className="text-sm text-br-dk-sub">
        Hosts cannot send these words to listeners or staff from the Host tab. One per line. Capital letters, spacing tricks and look-alike
        characters (like $ for s) are caught too. A short starter list is always on.
      </p>
      {loaded && <textarea value={text} onChange={e => setText(e.target.value)} rows={14}
        className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none font-mono" />}
      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}
      <PrimaryButton onClick={save} busy={busy}>SAVE</PrimaryButton>
    </div>
  )
}
