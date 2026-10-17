'use client'

import { useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { EMOJI_CHOICES, MAX_HOST_EMOJIS, type HostPrefs, type HostTheme } from '@/lib/profile'
import { ErrorText } from '@/components/AuthUI'

const THEMES: { id: HostTheme; label: string }[] = [
  { id: 'auto', label: 'Automatic' }, { id: 'standard', label: 'Standard' }, { id: 'art', label: 'Album art colors' },
]

/** A host's own options for their shows. Saved as you change them. */
export default function HostOptions() {
  const [p, setP] = useState<HostPrefs | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { apiGet<{ hostPrefs: HostPrefs }>('/api/me').then(r => setP(r.hostPrefs)).catch(() => {}) }, [])
  if (!p) return null

  async function save(next: HostPrefs) {
    const prev = p; setP(next); setError('')
    try { await api('/api/me', { hostPrefs: next }) } catch (e) { setP(prev); setError(e instanceof Error ? e.message : 'Could not save.') }
  }
  const toggleEmoji = (e: string) => {
    const has = p!.emojis.includes(e)
    if (!has && p!.emojis.length >= MAX_HOST_EMOJIS) { setError(`Up to ${MAX_HOST_EMOJIS} reactions.`); return }
    void save({ ...p!, emojis: has ? p!.emojis.filter(x => x !== e) : [...p!.emojis, e] })
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-br-gold tracking-widest text-sm">YOUR SHOW OPTIONS</h2>
      <div className="sk-raised rounded-2xl p-5 space-y-5">
        <div>
          <p className="text-sm text-br-dk-text mb-2">Look during your show</p>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(t => (
              <button key={t.id} type="button" aria-pressed={p.theme === t.id} onClick={() => save({ ...p, theme: t.id })}
                      className={`sk-key rounded-lg py-2 text-xs text-br-dk-text ${p.theme === t.id ? 'ring-2 ring-br-gold' : ''}`}>{t.label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-br-dk-text">Reactions <span className="text-br-dk-sub">({p.emojis.length}/{MAX_HOST_EMOJIS})</span></p>
          <p className="text-xs text-br-dk-sub mb-2">{p.emojis.length ? 'Listeners see these during your show.' : 'None picked: listeners see the usual ones.'}</p>
          <div className="flex flex-wrap gap-2">
            {EMOJI_CHOICES.map(e => (
              <button key={e} type="button" aria-pressed={p.emojis.includes(e)} onClick={() => toggleEmoji(e)}
                      className={`h-10 w-10 rounded-lg text-xl sk-key ${p.emojis.includes(e) ? 'ring-2 ring-br-gold' : ''}`}>{e}</button>
            ))}
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
    </section>
  )
}
