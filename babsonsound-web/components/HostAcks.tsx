'use client'

import { CONTENT_ACK, GEAR_ACK } from '@/lib/hostFlow'

/** The two ticks that replace the long agreement on a show request (the full agreement is part of the training). Each links to its guide in a new tab. */
export default function HostAcks({ gear, content, onGear, onContent }: { gear: boolean; content: boolean; onGear: (v: boolean) => void; onContent: (v: boolean) => void }) {
  const row = (checked: boolean, on: (v: boolean) => void, a: typeof GEAR_ACK | typeof CONTENT_ACK) => (
    <label className="flex items-start gap-3 text-base text-br-dk-text">
      <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={checked} onChange={e => on(e.target.checked)} />
      <span>{a.text}{' '}<a href={a.link.href} target="_blank" rel="noopener noreferrer" className="text-br-gold underline underline-offset-4">{a.link.label}</a>.</span>
    </label>
  )
  return <div className="space-y-3">{row(gear, onGear, GEAR_ACK)}{row(content, onContent, CONTENT_ACK)}</div>
}
