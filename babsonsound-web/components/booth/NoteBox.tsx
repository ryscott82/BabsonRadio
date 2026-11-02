'use client'

import { useState } from 'react'
import { api } from '@/lib/auth'
import { errText } from './helper'
import Modal from './Modal'

/** Leave a note for whoever uses the studio next (shown to them for 24 hours). */
export default function NoteBox({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try { await api('/api/booth/note', { sessionId, text }); onClose() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal onClose={onClose}>
      <div className="space-y-5">
        <h2 className="hw-title text-4xl">Note for the next host</h2>
        <p className="lbl text-xl">Shows at the top of this screen for whoever signs in next (24 hours).</p>
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={300} rows={4} autoFocus
                  placeholder="The left mic crackles, the aux cable is in the drawer…"
                  className="gfield w-full p-4 text-xl resize-none" />
        {error && <p className="text-lg warn">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="gbtn h-16 text-2xl">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !text.trim()} className="gbtn gbtn-go h-16 text-2xl">{busy ? 'Saving…' : 'Leave note'}</button>
        </div>
      </div>
    </Modal>
  )
}
