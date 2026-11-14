'use client'

import { useState } from 'react'
import { apiGet } from '@/lib/auth'
import { PHRASE_MAX, phraseVerdict, type PhraseTier } from '@/lib/phraseReference'

// The Explicit phrase reference checker (signed-in, trained members). Used on /words and in the signed-in studio booth's pop-up. `variant` only changes the look.
export default function PhraseReference({ variant = 'site', autoFocus = false }: { variant?: 'site' | 'booth'; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ q: string; tier: PhraseTier } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function check() {
    const q = text.trim()
    if (!q) return
    setBusy(true); setError('')
    try {
      const b = await apiGet<{ tier: PhraseTier }>(`/api/words/check?q=${encodeURIComponent(q)}`)
      setResult({ q, tier: b.tier })
    } catch (e) { setResult(null); setError(e instanceof Error ? e.message : 'Could not check right now.') }
    setBusy(false)
  }

  const booth = variant === 'booth'
  const v = result ? phraseVerdict(result.tier) : null
  const toneClass = !v ? '' : booth
    ? (v.tone === 'no' ? 'warn' : v.tone === 'caution' ? 'text-[#FFC94D]' : '')
    : (v.tone === 'no' ? 'text-br-red' : v.tone === 'caution' ? 'text-br-gold' : 'text-br-dk-text')
  return (
    <div className="space-y-4">
      <form className="flex gap-3" onSubmit={e => { e.preventDefault(); void check() }}>
        <label htmlFor="phrase" className="sr-only">Word or phrase</label>
        <input id="phrase" value={text} maxLength={PHRASE_MAX} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          onChange={e => { setText(e.target.value); setResult(null) }} placeholder="Type a word or phrase"
          className={booth ? 'flex-1 min-w-0 rounded-xl px-4 h-14 text-2xl bg-black/40 border border-white/25 text-white focus:outline-none'
                           : 'sk-field flex-1 min-w-0 rounded-xl px-4 py-3 text-base text-br-dk-text focus:outline-none'} />
        <button type="submit" disabled={busy || !text.trim()}
          className={booth ? 'gbtn h-14 px-6 text-2xl disabled:opacity-50' : 'sk-key rounded-xl px-5 min-h-11 text-base font-semibold text-br-dk-text disabled:opacity-50'}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>
      <div role="status" aria-live="polite" className={booth ? 'min-h-[5rem]' : 'min-h-[4rem]'}>
        {v && result && (
          <div className="space-y-1">
            <p className={`${booth ? 'text-3xl' : 'text-lg'} font-semibold ${toneClass}`}>{v.title}</p>
            <p className={booth ? 'text-xl opacity-90' : 'text-base text-br-dk-sub'}>{v.text}</p>
          </div>
        )}
        {error && <p className={booth ? 'text-xl warn' : 'text-base text-br-red'}>{error}</p>}
      </div>
    </div>
  )
}
