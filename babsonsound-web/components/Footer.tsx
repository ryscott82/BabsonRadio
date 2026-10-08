'use client'

import { usePathname } from 'next/navigation'
import { INSTAGRAM_URL, LINKS } from '@/lib/links'
import ContactEmail from './ContactEmail'
import TesterFeedback from './TesterFeedback'

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

export default function Footer() {
  if (usePathname() === '/coming-soon') return null
  const link = 'text-br-dk-sub hover:text-br-dk-text transition-colors'
  return (
    <footer className="relative z-[1] mt-20 border-t border-br-dk-border">
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
          <a href="/terms" className={link}>Terms</a>
          <span className="text-br-dk-sub">Contact: <ContactEmail className="text-br-dk-sub hover:text-br-dk-text underline underline-offset-4" /></span>
          <TesterFeedback />
          {INSTAGRAM_URL && <a href={INSTAGRAM_URL} {...ext} className={link}>Instagram</a>}
        </nav>
      </div>
      <p className="max-w-6xl mx-auto px-4 pb-6 text-xs text-br-dk-sub">
        Designed by <a href="https://ryanedwardscott.com" {...ext} className="underline underline-offset-4 hover:text-br-dk-text transition-colors">Ryan Scott</a>
      </p>
    </footer>
  )
}
