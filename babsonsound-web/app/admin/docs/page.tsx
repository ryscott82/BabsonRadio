'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import DocView from '@/components/admin/DocView'

interface DocItem { id: string; group: string; title: string; about: string; file: string }

// Admin only. The guides that live with the project (features by role, setup, studio, reference), readable without leaving Settings.
export default function DocsPage() {
  const { isAdmin, loading } = useAuth()
  const [docs, setDocs] = useState<DocItem[]>([])
  const [id, setId] = useState('')
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    apiGet<{ docs: DocItem[] }>('/api/admin/docs').then(r => { setDocs(r.docs); setId(cur => cur || r.docs[0]?.id || '') }).catch(e => setErr((e as Error).message))
  }, [isAdmin])
  useEffect(() => {
    if (!isAdmin || !id) return
    let live = true
    queueMicrotask(() => { if (live) { setBusy(true); setErr('') } })
    apiGet<{ text: string }>(`/api/admin/docs?id=${encodeURIComponent(id)}`)
      .then(r => { if (live) { setText(r.text); window.scrollTo({ top: 0 }) } })
      .catch(e => { if (live) { setText(''); setErr((e as Error).message) } })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [isAdmin, id])

  const groups = useMemo(() => {
    const g: Record<string, DocItem[]> = {}
    for (const d of docs) (g[d.group] ||= []).push(d)
    return Object.entries(g)
  }, [docs])
  // A link inside a guide to another guide's file name (like STUDIO.md) opens that guide.
  const links = useMemo(() => ({ byFile: Object.fromEntries(docs.map(d => [d.file, d.id])), open: setId }), [docs])
  const current = docs.find(d => d.id === id)

  if (loading || !isAdmin) return <div className="min-h-[60vh]" />
  return (
    <div className="ops-hub">
      <div className="px-5 lg:px-8 py-8 space-y-6">
        <header>
          <h1 className="text-4xl font-light leading-tight">Information and documentation</h1>
          <p className="text-base opacity-90 mt-1">The project guides, kept with the code. They refresh each time the site is built.</p>
        </header>
        <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
          <nav aria-label="Guides" className="ops-card p-4 space-y-4 lg:sticky lg:top-6">
            {groups.map(([group, items]) => (
              <div key={group} className="space-y-1.5">
                <p className="text-sm opacity-80">{group}</p>
                {items.map(d => (
                  <button key={d.id} type="button" onClick={() => setId(d.id)} aria-pressed={d.id === id}
                          className={`ops-btn w-full text-left px-3 py-2 ${d.id === id ? 'underline underline-offset-4' : ''}`}>
                    {d.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <article className="ops-card p-5 lg:p-8 min-w-0" aria-busy={busy}>
            {current && <p className="text-sm opacity-80 mb-4">{current.about}</p>}
            {err && <p role="alert">{err}</p>}
            {!err && text && <DocView text={text} links={links} />}
            {!err && !text && <p className="opacity-80">{busy ? 'Loading.' : 'Pick a guide.'}</p>}
          </article>
        </div>
      </div>
    </div>
  )
}
