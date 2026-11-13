'use client'

import { useEffect, useRef, useState } from 'react'
import { errText, helper } from './helper'
import Modal from './Modal'

export const SHOW_CATEGORIES = ['Music', 'Interview', 'Podcast', 'Talk', 'News']
export interface Show { title: string; hosts: string[]; description: string; category: string; onAir?: boolean }

/** Name the show and who is on it. Shown in the library when the show is archived. Open it any time: changes are saved on this PC as you type,
 *  so it can be edited during the show, and whatever it says when the show ends is what the archive gets. */
export default function ShowInfo({ getToken, live, onClose }: { getToken: () => Promise<string>; live: boolean; onClose: () => void }) {
  const [show, setShow] = useState<Show | null>(null)
  const [hosts, setHosts] = useState('')
  const [state, setState] = useState<'' | 'saving' | 'saved'>('')
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<Show | null>(null)

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const s = await helper<Show>('/show/get', { token: await getToken() })
        if (off) return
        latest.current = s; setShow(s); setHosts(s.hosts.join(', '))
      } catch (e) { if (!off) setError(errText(e)) }
    })()
    return () => { off = true }
  }, [getToken])

  const flush = async () => {
    const s = latest.current
    if (!s) return
    setState('saving'); setError('')
    try { await helper('/show/set', { token: await getToken(), title: s.title, hosts: s.hosts, description: s.description, category: s.category }); setState('saved') }
    catch (e) { setError(errText(e)); setState('') }
  }
  const change = (patch: Partial<Show>) => {
    if (!latest.current) return
    latest.current = { ...latest.current, ...patch }; setShow(latest.current)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, 700)
  }
  // Closing the window saves what is still waiting.
  const close = async () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; await flush() } onClose() }

  return (
    <Modal onClose={close}>
      <div className="space-y-4">
        <h2 className="hw-title text-4xl">Show info</h2>
        <p className="lbl text-lg">{live ? 'You can change this during the show. ' : ''}This is how the show is named in the Babson Sound library after it ends.</p>
        {!show ? <p className="text-xl lbl">{error || 'Loading…'}</p> : (
          <>
            <label className="block space-y-1"><span className="lbl text-lg">Show name</span>
              <input value={show.title} onChange={e => change({ title: e.target.value })} maxLength={80} autoFocus placeholder="Friday Night Mix" className="gfield w-full p-3 text-2xl" />
            </label>
            <label className="block space-y-1"><span className="lbl text-lg">Who’s on the show (separate with commas)</span>
              <input value={hosts} onChange={e => { setHosts(e.target.value); change({ hosts: e.target.value.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean) }) }}
                     placeholder="Pat Doe, Kim Roe" className="gfield w-full p-3 text-2xl" />
            </label>
            <div className="space-y-1"><span className="lbl text-lg">Type</span>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Type of show">
                {SHOW_CATEGORIES.map(c => (
                  <button key={c} type="button" className="gbtn h-12 px-5 text-xl" aria-pressed={show.category === c} onClick={() => change({ category: show.category === c ? '' : c })}>{c}</button>
                ))}
              </div>
            </div>
            <label className="block space-y-1"><span className="lbl text-lg">About the show (optional)</span>
              <textarea value={show.description} onChange={e => change({ description: e.target.value })} maxLength={500} rows={3} className="gfield w-full p-3 text-xl resize-none" />
            </label>
          </>
        )}
        {error && show && <p className="text-lg warn">{error}</p>}
        <div className="flex items-center justify-between gap-4">
          <span className="lbl text-lg">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}</span>
          <button type="button" onClick={close} className="gbtn gbtn-go h-16 px-10 text-2xl">Done</button>
        </div>
      </div>
    </Modal>
  )
}
