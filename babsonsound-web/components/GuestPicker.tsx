'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { addChip, capacityLine, chipFromSuggestion, chipLabel, guestsProblem, parseTyped, removeChip, spotsLeft, type GuestChip, type Suggestion } from '@/lib/guestPicker'

/**
 * Who is coming with you (the studio booking form and the Host a show form).
 * Type a name for suggestions (your past guests first, then members; each shows a masked email), or type a name and an email.
 * Needed unless "Just me" is ticked. The full email of someone else is never shown.
 */
export default function GuestPicker({ chips, onChips, justMe, onJustMe, capacity, error }: {
  chips: GuestChip[]; onChips: (c: GuestChip[]) => void; justMe: boolean; onJustMe: (v: boolean) => void; capacity: number; error?: string
}) {
  const [text, setText] = useState('')
  const [sugg, setSugg] = useState<Suggestion[]>([])
  const [hi, setHi] = useState(-1)
  const [msg, setMsg] = useState('')
  const id = useId()
  const seq = useRef(0)

  // Suggestions load a moment after you stop typing (two letters or more). Nothing runs on a timer.
  useEffect(() => {
    const q = text.trim()
    if (justMe || q.length < 2 || q.includes('@')) { queueMicrotask(() => setSugg([])); return }
    const n = ++seq.current
    const t = setTimeout(() => {
      apiGet<{ results: Suggestion[] }>(`/api/people/suggest?q=${encodeURIComponent(q)}`)
        .then(r => { if (n === seq.current) { setSugg(r.results.filter(s => !chips.some(c => c.id === s.id))); setHi(-1) } })
        .catch(() => { if (n === seq.current) setSugg([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [text, justMe, chips])

  function add(next: GuestChip) {
    const r = addChip(chips, next, capacity)
    if (!r.ok) { setMsg(r.error); return }
    setMsg(''); onChips(r.chips); setText(''); setSugg([])
  }
  function addTypedText() {
    const r = parseTyped(text)
    if (!r.ok) { setMsg(r.error); return }
    add(r.chip)
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); setHi(h => (h + 1) % sugg.length) }
    else if (e.key === 'ArrowUp' && sugg.length) { e.preventDefault(); setHi(h => (h <= 0 ? sugg.length - 1 : h - 1)) }
    else if (e.key === 'Escape') setSugg([])
    else if (e.key === 'Enter' || e.key === ',') {
      if (e.key === ',' && !text.includes('@')) return
      e.preventDefault()
      if (hi >= 0 && sugg[hi]) add(chipFromSuggestion(sugg[hi]))
      else if (text.trim()) addTypedText()
    }
  }

  const left = spotsLeft(chips, capacity)
  const problem = error || ''
  return (
    <fieldset className="space-y-3">
      <legend className="block text-base text-br-dk-sub mb-1.5 font-display tracking-widest">Who is coming</legend>
      <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11">
        <input type="checkbox" className="w-5 h-5" checked={justMe} onChange={e => { onJustMe(e.target.checked); if (e.target.checked) { onChips([]); setText(''); setSugg([]) } setMsg('') }} />
        Just me
      </label>
      {!justMe && (
        <>
          <div className="relative">
            <input id={id} value={text} onChange={e => { setText(e.target.value); setMsg('') }} onKeyDown={onKey}
                   role="combobox" aria-expanded={sugg.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list"
                   aria-activedescendant={hi >= 0 ? `${id}-${hi}` : undefined} disabled={left === 0}
                   autoComplete="off" maxLength={120} placeholder={left === 0 ? 'The studio is full' : 'Type a name, or a name and an email'}
                   className="sk-field w-full rounded-xl px-4 py-3 text-base text-br-dk-text focus:outline-none" />
            {sugg.length > 0 && (
              <ul id={`${id}-list`} role="listbox" className="absolute z-20 left-0 right-0 mt-1 sk-raised rounded-xl overflow-hidden">
                {sugg.map((s, i) => (
                  <li key={s.id} id={`${id}-${i}`} role="option" aria-selected={i === hi}>
                    <button type="button" onClick={() => add(chipFromSuggestion(s))} onMouseEnter={() => setHi(i)}
                            className={`w-full text-left px-4 py-3 min-h-12 ${i === hi ? 'bg-br-dk-surface2' : ''}`}>
                      <span className="block text-base text-br-dk-text">{s.name}</span>
                      <span className="block text-base text-br-dk-sub">{s.emailMasked}{s.kind === 'past' ? ' · past guest' : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={addTypedText} disabled={!text.trim() || left === 0} className="sk-key rounded-lg px-4 min-h-11 text-base text-br-dk-text disabled:opacity-40">Add</button>
            <p className="text-base text-br-dk-sub">{capacityLine(chips, capacity)}</p>
          </div>
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Guests">
              {chips.map(c => (
                <li key={c.key} className="sk-field rounded-xl pl-3 pr-1 py-1 flex items-center gap-2 min-h-11">
                  <span className="min-w-0">
                    <span className="block text-base text-br-dk-text truncate max-w-[14rem]">{c.name}</span>
                    <span className={`block text-base truncate max-w-[14rem] ${c.outside ? 'text-br-gold' : 'text-br-dk-sub'}`}>{chipLabel(c)}</span>
                  </span>
                  <button type="button" onClick={() => onChips(removeChip(chips, c.key))} aria-label={`Remove ${c.name}`} className="w-11 h-11 text-lg text-br-dk-sub">×</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {(msg || problem) && <p role="alert" className="text-base text-br-red">{msg || problem}</p>}
      {!justMe && !chips.length && !msg && !problem && <p className="text-base text-br-dk-sub">{guestsProblem(chips, justMe)}</p>}
    </fieldset>
  )
}
