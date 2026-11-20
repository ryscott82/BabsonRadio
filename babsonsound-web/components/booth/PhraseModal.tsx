'use client'

import { useEffect } from 'react'
import PhraseReference from '@/components/PhraseReference'

// The Explicit phrase reference over the signed-in booth screen, so a word can be checked mid-show without leaving the booth.
export default function PhraseModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[96] bg-black/60 flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="phrase-title" className="hw-screen w-full max-w-3xl rounded-2xl p-8 space-y-5 text-white">
        <div className="flex items-start gap-4">
          <h2 id="phrase-title" className="hw-title text-4xl flex-1">Explicit phrase reference</h2>
          <button type="button" className="gbtn h-12 px-5 text-xl" onClick={onClose}>Close</button>
        </div>
        <p className="text-xl opacity-85">Slurs: never. Explicit words and profanity: not from 6 AM to 8 PM Eastern. Not sure? Leave it out.</p>
        <PhraseReference variant="booth" autoFocus />
      </div>
    </div>
  )
}
