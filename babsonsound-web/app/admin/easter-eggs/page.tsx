'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { PITTSBURGH } from '@/lib/reactionThemes'
import EmojiGlyph from '@/components/EmojiGlyph'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

interface Egg { id: string; name: string; enabled: boolean; artist: string[]; title: string[]; show: string[]; emojis: string[] }

const csv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
const box = 'sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text focus:outline-none w-full'
const lab = 'block text-xs text-br-dk-sub mb-1 font-display tracking-widest'

export default function EasterEggsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [eggs, setEggs] = useState<Egg[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<{ eggs: Egg[] }>('/api/admin/easter-eggs').then(r => setEggs(r.eggs))
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  if (!user || !isAdmin || !eggs) return null
  const set = (i: number, patch: Partial<Egg>) => setEggs(eggs.map((e, j) => (j === i ? { ...e, ...patch } : e)))

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api<{ eggs: Egg[] }>('/api/admin/easter-eggs', { eggs })
      setEggs(r.eggs); setNotice('Saved. Takes about a minute to show everywhere.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">EASTER EGGS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">While a matching song, artist or show is on, the reaction row switches to your emojis. Matches are plain words, not case sensitive. First matching rule wins.</p>

      {eggs.map((e, i) => (
        <section key={e.id} className="sk-raised rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <input className={box} value={e.name} onChange={ev => set(i, { name: ev.target.value })} aria-label="Name" />
            <label className="flex items-center gap-2 text-xs text-br-dk-sub shrink-0">
              <input type="checkbox" checked={e.enabled} onChange={ev => set(i, { enabled: ev.target.checked })} /> On
            </label>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label><span className={lab}>ARTIST CONTAINS</span>
              <input className={box} defaultValue={e.artist.join(', ')} onBlur={ev => set(i, { artist: csv(ev.target.value.toLowerCase()) })} placeholder="mac miller" /></label>
            <label><span className={lab}>SONG CONTAINS</span>
              <input className={box} defaultValue={e.title.join(', ')} onBlur={ev => set(i, { title: csv(ev.target.value.toLowerCase()) })} /></label>
            <label><span className={lab}>SHOW CONTAINS</span>
              <input className={box} defaultValue={e.show.join(', ')} onBlur={ev => set(i, { show: csv(ev.target.value.toLowerCase()) })} /></label>
          </div>
          <label className="block"><span className={lab}>EMOJIS (UP TO 8, SEPARATED BY SPACES)</span>
            <input className={box} defaultValue={e.emojis.join(' ')}
                   onBlur={ev => set(i, { emojis: ev.target.value.split(/\s+/).filter(Boolean).slice(0, 8) })} /></label>
          <div className="flex items-center gap-2 text-xl min-h-8">
            {e.emojis.map(x => <EmojiGlyph key={x} e={x} size="1.4rem" />)}
          </div>
          <div className="flex gap-4 text-xs">
            <button type="button" className="text-br-dk-sub underline" onClick={() => set(i, { emojis: [...PITTSBURGH] })}>Use Pittsburgh set</button>
            <button type="button" className="text-br-dk-sub underline" onClick={() => set(i, { emojis: [':br:', '🔥', '❤️', '🤘'] })}>Use beaver set</button>
            <button type="button" className="text-br-dk-sub hover:text-br-red ml-auto" onClick={() => setEggs(eggs.filter((_, j) => j !== i))}>Delete</button>
          </div>
        </section>
      ))}

      <button type="button" className="sk-key rounded-lg px-4 py-2 text-xs font-display tracking-widest text-br-dk-text"
              onClick={() => setEggs([...eggs, { id: `egg-${Date.now().toString(36)}`, name: 'New easter egg', enabled: true, artist: [], title: [], show: [], emojis: ['🎉', '🔥', '❤️', '🤘'] }])}>
        ADD EASTER EGG
      </button>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}
      <PrimaryButton busy={busy} onClick={save}>SAVE</PrimaryButton>
    </div>
  )
}
