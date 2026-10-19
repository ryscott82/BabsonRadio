'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Item { id: string; showTitle: string; startAt: number; songs: string; songCount: number }

export default function AdminSetlistsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (user && isAdmin) apiGet<{ items: Item[] }>('/api/admin/setlists').then(r => setItems(r.items))
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load set lists.'))
  }, [user, isAdmin])

  if (!user || !isAdmin) return null

  function download() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const rows = [['Show', 'Aired', 'Song'].map(esc).join(',')]
    for (const i of items) {
      for (const line of i.songs.split('\n').map(l => l.trim()).filter(Boolean)) {
        rows.push([i.showTitle, new Date(i.startAt).toLocaleString(), line].map(esc).join(','))
      }
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'babson-radio-setlists.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Set lists</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <button onClick={download} disabled={!items.length}
                className="sk-btn font-display tracking-widest text-xs px-4 py-2 rounded-lg shrink-0 disabled:opacity-50">Download csv</button>
      </div>
      <p className="text-sm text-br-dk-sub">Songs hosts reported playing on air, newest first. The CSV has one row per song.</p>
      <ErrorText>{error}</ErrorText>
      {items.length === 0 && !error && <p className="text-sm text-br-dk-sub">No set lists yet.</p>}
      {items.map(i => (
        <details key={i.id} className="sk-raised rounded-xl p-4">
          <summary className="cursor-pointer flex items-center justify-between gap-3">
            <span className="text-sm text-br-dk-text">{i.showTitle || 'Show'} · {new Date(i.startAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span className="text-xs text-br-dk-sub shrink-0">{i.songCount} songs</span>
          </summary>
          <pre className="mt-3 text-xs text-br-dk-text whitespace-pre-wrap font-sans">{i.songs || '(empty)'}</pre>
        </details>
      ))}
    </div>
  )
}
