'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { openSignIn } from '@/lib/signInPrompt'
import { parseStart } from '@/lib/episodePlayer'
import type { Timeline } from '@/lib/trackLog'
import EpisodePlayer from '@/components/EpisodePlayer'
import { ago, type Ep } from '@/components/EpisodeRow'

interface Loaded { episode: Ep & { visibility: 'public' | 'private' }; setlist: string[]; timeline?: Timeline | null }

/** One episode on its own page, the address people share. Public episodes open for anyone; private ones ask for a Babson sign-in. */
export default function EpisodeView({ id, t = '' }: { id: string; t?: string }) {
  const { user, loading } = useAuth()
  const key = `${id}:${user?.uid ?? ''}`
  const [res, setRes] = useState<{ key: string; d?: Loaded; err?: string } | null>(null)
  const start = parseStart(t)
  useEffect(() => {
    if (loading) return
    let off = false
    apiGet<Loaded>(`/api/episodes/${encodeURIComponent(id)}`).then(r => { if (!off) setRes({ key, d: r }) }).catch(e => { if (!off) setRes({ key, err: (e as Error).message || 'Could not load this episode.' }) })
    return () => { off = true }
  }, [id, key, loading])
  const now = res && res.key === key ? res : null
  const d = now?.d ?? null, err = now?.err ?? ''

  if (loading || !now) return <p className="px-5 py-10 text-br-dk-sub">Loading…</p>
  if (err || !d) {
    const needSignIn = /sign in|BR-PERM-001|students/i.test(err) && !/not found/i.test(err)
    return (
      <div className="max-w-xl mx-auto px-5 py-12 space-y-4 text-center">
        <h1 className="font-display text-br-dk-text text-2xl tracking-[0.08em]">{needSignIn ? 'This episode is for Babson students' : 'Episode not found'}</h1>
        <p className="text-br-dk-sub">{needSignIn ? (user ? 'Your account does not have library access.' : 'Sign in with your Babson account to listen.') : 'The link may be wrong, or the episode was removed.'}</p>
        <div className="flex justify-center gap-3">
          {needSignIn && !user && <button type="button" onClick={() => openSignIn()} className="sk-btn font-display tracking-widest text-sm px-5 min-h-11 rounded-lg">Sign in</button>}
          <Link href="/library" className="sk-key rounded-lg px-5 min-h-11 inline-flex items-center text-sm font-display tracking-widest text-br-dk-text">Library</Link>
        </div>
      </div>
    )
  }
  const e = d.episode
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="sk-raised rounded-2xl overflow-hidden">
        {e.audio ? <EpisodePlayer ep={e} startAt={start} timeline={d.timeline ?? null} /> : (
          <div className="aspect-video bg-black">
            <iframe className="w-full h-full" title={e.title} allowFullScreen src={`https://www.youtube-nocookie.com/embed/${e.youtubeID}?rel=0${start ? `&start=${start}` : ''}`}
                    allow="encrypted-media; picture-in-picture" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-br-dk-text text-2xl tracking-[0.06em]">{e.title}</h1>
        <p className="text-sm text-br-dk-sub">{e.showName && e.showName !== e.title ? `${e.showName} · ` : ''}{e.category ? `${e.category} · ` : ''}{e.publishedAt ? ago(e.publishedAt) : ''}</p>
        {!!e.contributors?.length && <p className="text-sm text-br-dk-sub">With {e.contributors.join(', ')}</p>}
        {e.description && <p className="text-br-dk-text whitespace-pre-line">{e.description}</p>}
      </div>
      {d.setlist.length > 0 && (
        <section className="sk-raised rounded-2xl p-4 space-y-2">
          <h2 className="font-display text-br-gold tracking-widest text-sm">Set list</h2>
          <ol className="text-sm text-br-dk-text space-y-1 list-decimal pl-5">{d.setlist.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      )}
      <p className="text-sm"><Link href="/library#episodes" className="text-br-gold underline underline-offset-4">More episodes</Link></p>
    </div>
  )
}
