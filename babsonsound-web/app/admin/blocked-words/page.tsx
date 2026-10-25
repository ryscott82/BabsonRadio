'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

type Level = 'crude' | 'explicit'
interface Cfg { words: string[]; level: Level; counts: { crude: number; explicit: number; banned: number } }

export default function BlockedWordsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [text, setText] = useState('')
  const [level, setLevel] = useState<Level>('explicit')
  const [counts, setCounts] = useState<Cfg['counts'] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<Cfg>('/api/admin/blocked-words').then(r => { setText(r.words.join('\n')); setLevel(r.level); setCounts(r.counts); setLoaded(true) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const words = text.split(/[\n,]/).map(w => w.trim()).filter(Boolean)
      const r = await api<Cfg>('/api/admin/blocked-words', { words, level })
      setText(r.words.join('\n')); setLevel(r.level); setNotice('Saved.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }
  async function check() {
    setResult('')
    try {
      const r = await apiGet<{ tier: string; blocked: boolean }>(`/api/admin/blocked-words?check=${encodeURIComponent(phrase)}`)
      setResult(r.tier === 'clean' ? 'Clean. This would go through.' : `${r.tier[0].toUpperCase()}${r.tier.slice(1)} word found. ${r.blocked ? 'This would be blocked.' : 'This would go through at the current level.'}`)
    } catch (e) { setResult(e instanceof Error ? e.message : 'Could not check.') }
  }

  if (loading || !isAdmin) return null
  const opt = 'flex gap-3 items-start text-sm text-br-dk-text'
  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Blocked words</h1>
      <p className="text-sm text-br-dk-sub">
        Hosts cannot send these words to listeners or staff from the Host tab. Capital letters, look-alike characters (like $ for s),
        stretched letters, spaced-out letters and star-outs (f*ck) are caught too. Whole words are matched, so ordinary words that
        happen to contain a rude one are fine.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-br-dk-text text-lg mb-1">How strict</legend>
        <label className={opt}>
          <input type="radio" name="level" checked={level === 'explicit'} onChange={() => setLevel('explicit')} className="mt-1" />
          <span><strong>Block explicit and banned words</strong> (default). Crude words like hell and damn go through.</span>
        </label>
        <label className={opt}>
          <input type="radio" name="level" checked={level === 'crude'} onChange={() => setLevel('crude')} className="mt-1" />
          <span><strong>Keep it clean.</strong> Also blocks crude words like hell, damn, pussy and retarded.</span>
        </label>
        <p className="text-sm text-br-dk-sub">Banned words (racial, ethnic and homophobic slurs) are always blocked, whatever you pick.</p>
        {counts && (
          <p className="text-sm text-br-dk-sub">Built in: {counts.crude} crude, {counts.explicit} explicit, {counts.banned} banned words and spellings.</p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="extra" className="text-br-dk-text text-lg block">Your own extra words</label>
        <p className="text-sm text-br-dk-sub">One per line. These count as explicit.</p>
        {loaded && <textarea id="extra" value={text} onChange={e => setText(e.target.value)} rows={8}
          className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none font-mono" />}
      </div>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}
      <PrimaryButton onClick={save} busy={busy}>Save</PrimaryButton>

      <div className="space-y-2 pt-4 border-t border-white/15">
        <label htmlFor="try" className="text-br-dk-text text-lg block">Try a phrase</label>
        <p className="text-sm text-br-dk-sub">Checks it against the saved settings. Nothing is sent anywhere.</p>
        <input id="try" value={phrase} onChange={e => { setPhrase(e.target.value); setResult('') }} onKeyDown={e => { if (e.key === 'Enter') check() }}
          className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
        <button type="button" onClick={check} className="text-sm text-br-gold underline">Check</button>
        {result && <p role="status" className="text-sm text-br-dk-text">{result}</p>}
      </div>
    </div>
  )
}
