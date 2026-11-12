'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'
import { adminBody, canEditList, directorBody, newWordCount, type Level } from '@/lib/blockedWordsPage'

interface Cfg { words: string[]; level: Level; counts: { crude: number; explicit: number; banned: number; phrases: number } }

export default function BlockedWordsPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const admin = canEditList(isAdmin)
  const [text, setText] = useState('')
  const [level, setLevel] = useState<Level>('explicit')
  const [counts, setCounts] = useState<Cfg['counts'] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  const [phrase, setPhrase] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace('/') }, [loading, user, isDirector, router])
  useEffect(() => {
    if (!user || !isDirector) return
    apiGet<Cfg>('/api/admin/blocked-words').then(r => { setText(isAdmin ? r.words.join('\n') : ''); setSaved(r.words); setLevel(r.level); setCounts(r.counts); setLoaded(true) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isDirector, isAdmin])

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const added = newWordCount(saved, text)
      const r = await api<Cfg>('/api/admin/blocked-words', admin ? adminBody(text, level) : directorBody(saved, text))
      setSaved(r.words); setLevel(r.level)
      setText(admin ? r.words.join('\n') : '')
      setNotice(admin ? 'Saved.' : added ? `Added ${added} ${added === 1 ? 'word' : 'words'}.` : 'Nothing new to add.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }
  async function check() {
    setResult('')
    try {
      const r = await apiGet<{ tier: string; starred: boolean; blocked: boolean }>(`/api/admin/blocked-words?check=${encodeURIComponent(phrase)}&level=${level}`)
      setResult(r.tier === 'clean' ? 'Clean. This would go through.' : `${r.tier[0].toUpperCase()}${r.tier.slice(1)} word found${r.starred ? ', starred out' : ''}. ${r.blocked ? 'This would be blocked.' : 'This would go through at the current setting.'}`)
    } catch (e) { setResult(e instanceof Error ? e.message : 'Could not check.') }
  }

  if (loading || !isDirector) return null
  const opt = 'flex gap-3 items-start text-base text-br-dk-text'
  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Blocked words</h1>
      <p className="text-base text-br-dk-sub">
        Hosts cannot send these words to listeners or staff from the Host tab. Capital letters, look-alike characters (like $ for s),
        stretched letters, spaced-out letters and star-outs (f*ck) are caught too. Whole words are matched, so ordinary words that
        happen to contain a rude one are fine.
      </p>

      {admin ? (
      <>
      <fieldset className="space-y-3">
        <legend className="text-br-dk-text text-lg mb-1">How strict</legend>
        <label className={opt}>
          <input type="radio" name="level" checked={level === 'explicit'} onChange={() => setLevel('explicit')} className="mt-1" />
          <span><strong>TV-MA (default).</strong> Blocks explicit and banned words. Crude words like hell and damn go through, and so do starred-out swear words like f**k.</span>
        </label>
        <label className={opt}>
          <input type="radio" name="level" checked={level === 'crude'} onChange={() => setLevel('crude')} className="mt-1" />
          <span><strong>TV-PG (keep it clean).</strong> Also blocks crude words like hell, damn, pussy and retarded, and every starred-out word.</span>
        </label>
        <p className="text-base text-br-dk-sub">Banned words (racial, ethnic and homophobic slurs) are always blocked, starred out or not, whatever you pick.</p>
        {counts && (
          <p className="text-base text-br-dk-sub">Built in: {counts.crude} crude, {counts.explicit} explicit, {counts.banned} banned words and spellings, plus {counts.phrases} phrases.</p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="extra" className="text-br-dk-text text-lg block">Your own extra words</label>
        <p className="text-base text-br-dk-sub">One per line. These count as explicit.</p>
        {loaded && <textarea id="extra" value={text} onChange={e => setText(e.target.value)} rows={8}
          className="sk-field w-full rounded-xl px-4 py-3 text-base text-br-dk-text focus:outline-none font-mono" />}
      </div>
      </>
      ) : (
      <div className="space-y-4">
        <p className="text-base text-br-dk-sub">The filter blocks {level === 'crude' ? 'crude, explicit and banned' : 'explicit and banned'} words. An Admin sets how strict it is and can remove words.</p>
        <div className="space-y-2">
          <label htmlFor="add" className="text-br-dk-text text-lg block">Add a word</label>
          <p className="text-base text-br-dk-sub">One word or phrase, or several separated by commas. They count as explicit.</p>
          <input id="add" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) save() } }}
            className="sk-field w-full rounded-xl px-4 py-3 text-base text-br-dk-text focus:outline-none min-h-11" />
        </div>
        <div className="space-y-2">
          <h2 className="text-br-dk-text text-lg">Words added by staff ({saved.length})</h2>
          {loaded && saved.length === 0 && <p className="text-base text-br-dk-sub">None yet.</p>}
          <ul className="flex flex-wrap gap-2">
            {saved.map(w => <li key={w} className="sk-raised rounded-lg px-3 py-1.5 text-base text-br-dk-text">{w}</li>)}
          </ul>
        </div>
      </div>
      )}

      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-base text-br-gold">{notice}</p>}
      <PrimaryButton onClick={save} busy={busy}>{admin ? 'Save' : 'Add word'}</PrimaryButton>

      <div className="space-y-2 pt-4 border-t border-white/15">
        <label htmlFor="try" className="text-br-dk-text text-lg block">Try a phrase</label>
        <p className="text-base text-br-dk-sub">Checks it with the strictness picked above, even before you save. Nothing is sent anywhere.</p>
        <input id="try" value={phrase} onChange={e => { setPhrase(e.target.value); setResult('') }} onKeyDown={e => { if (e.key === 'Enter') check() }}
          className="sk-field w-full rounded-xl px-4 py-3 text-base text-br-dk-text focus:outline-none" />
        <button type="button" onClick={check} className="text-base text-br-gold underline">Check</button>
        {result && <p role="status" className="text-base text-br-dk-text">{result}</p>}
      </div>
    </div>
  )
}
