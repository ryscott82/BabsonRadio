'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

const box = 'sk-field rounded-lg px-3 py-2.5 text-sm text-br-dk-text w-full focus:outline-none lg:text-base lg:py-3'

export default function SubmitPage() {
  const { user, hasMemberAccess } = useAuth()
  const [kind, setKind] = useState<'song' | 'playlist'>('song')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setDone('')
    try {
      await api('/api/submissions', { kind, title, artist, url, note })
      setTitle(''); setArtist(''); setUrl(''); setNote(''); setDone('Sent. Thank you.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Try again.') }
    setBusy(false)
  }

  return (
    <div className="max-w-3xl lg:max-w-4xl w-full mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl lg:text-4xl tracking-[0.1em] shrink-0">Suggest</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      {!user || !hasMemberAccess ? (
        <p className="text-sm text-br-dk-sub"><Link href="/auth" className="text-br-gold">Sign in</Link> to send music to the station.</p>
      ) : (
        <form onSubmit={send} className="space-y-5 lg:space-y-6">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="What are you sending?">
            {(['song', 'playlist'] as const).map(k => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setError(''); setDone('') }}
                      className="sk-key rounded-xl py-3 text-sm lg:text-base font-display tracking-widest text-br-dk-text">{k === 'song' ? 'A song' : 'A playlist'}</button>
            ))}
          </div>
          {kind === 'song' ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <input className={box} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Song title" aria-label="Song title" />
              <input className={box} value={artist} onChange={e => setArtist(e.target.value)} maxLength={120} placeholder="Artist" aria-label="Artist" />
            </div>
          ) : (
            <div className="space-y-3">
              <input className={box} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Playlist name" aria-label="Playlist name" />
              <input className={box} type="url" value={url} onChange={e => setUrl(e.target.value)} maxLength={400} placeholder="Link (Spotify, Apple Music, YouTube…)" aria-label="Playlist link" />
            </div>
          )}
          <input className={box} value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Anything we should know? (optional)" aria-label="Note" />
          <ErrorText>{error}</ErrorText>
          {done && <p role="status" className="text-sm text-br-gold">{done}</p>}
          <button type="submit" disabled={busy} className="sk-key font-display tracking-widest text-sm lg:text-base px-5 py-3.5 rounded-xl w-full text-br-gold">
            {busy ? 'SENDING…' : 'SEND'}
          </button>
        </form>
      )}
    </div>
  )
}
