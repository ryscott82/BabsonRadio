'use client'

import { usePathname } from 'next/navigation'
import { INSTAGRAM_URL, LINKS } from '@/lib/links'

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

export default function Footer() {
  if (usePathname() === '/coming-soon') return null
  const link = 'text-br-dk-sub hover:text-br-dk-text transition-colors'
  return (
    <footer className="mt-20 border-t border-br-dk-border">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-4">
        <p className="font-display tracking-[0.3em] text-sm text-br-dk-text">
          <span className="text-br-gold">BABSON</span> RADIO
        </p>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <a href={LINKS.interest} {...ext} className={link}>Interest form</a>
          <a href={LINKS.about} {...ext} className={link}>About us</a>
          <a href={LINKS.events} {...ext} className={link}>Events</a>
          <a href={LINKS.join} {...ext} className={link}>Join Babson Sound</a>
          <a href="/privacy" className={link}>Privacy</a>
          {INSTAGRAM_URL && <a href={INSTAGRAM_URL} {...ext} className={link}>Instagram</a>}
        </nav>
      </div>
    </footer>
  )
}
