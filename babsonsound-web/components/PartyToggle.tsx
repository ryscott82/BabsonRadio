'use client'

import { setParty, useParty } from '@/lib/party'

/** A party hat in the top bar, only at night: switches between the party colors and the calm vintage look. */
export default function PartyToggle() {
  const { night, party } = useParty()
  if (!night) return null
  return (
    <button
      type="button" onClick={() => setParty(!party)} role="switch" aria-checked={party}
      aria-label={party ? 'Turn off party colors' : 'Turn on party colors'} title={party ? 'Party colors on' : 'Party colors off'}
      className={`sk-key rounded-lg w-9 h-9 flex items-center justify-center ${party ? 'text-br-gold' : 'text-br-dk-sub'}`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 20 11 5l8 11z" fill={party ? 'currentColor' : 'none'} fillOpacity={0.18} />
        <path d="M3.5 20h17" />
        <path d="M8.2 13.5c1.6 1 3.2 1 4.8 0" />
        <circle cx="12.6" cy="4" r="1.3" fill="currentColor" stroke="none" />
        <path d="M15.5 4.5l1.6-1.4M16.5 7l2-.4" />
      </svg>
    </button>
  )
}
