'use client'

import { useState } from 'react'
import { LINKS } from '@/lib/links'

// Shares the interest form with friends: the phone's share sheet where available, otherwise copies the link.
export default function ShareFormButton({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const data = { title: 'Babson Radio', text: 'Student radio is coming back to Babson. Tell them what you want to hear:', url: LINKS.interest }
    try {
      if (navigator.share) { await navigator.share(data); return }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // they closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(LINKS.interest)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch { window.prompt('Copy this link', LINKS.interest) }
  }

  return (
    <button type="button" onClick={share}
            className={`sk-key rounded-xl font-display tracking-[0.2em] text-sm px-6 py-3.5 text-br-dk-text ${className}`}>
      {copied ? 'LINK COPIED' : 'SHARE THE FORM'}
    </button>
  )
}
