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
    <footer className="hw-foot relative z-[1]">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 py-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-xs">
        <p className="tracking-[0.3em] text-xs font-bold text-br-dk-text shrink-0">
          <span className="text-br-gold">Babson</span> RADIO
        </p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href={LINKS.interest} {...ext} className={link}>Interest form</a>
          <a href={LINKS.about} {...ext} className={link}>About us</a>
          <a href={LINKS.events} {...ext} className={link}>Events</a>
          <a href={LINKS.join} {...ext} className={link}>Join Babson Sound</a>
          <a href="/privacy" className={link}>Privacy</a>
          <a href="/terms" className={link}>Terms</a>
          <span className="text-br-dk-sub">Contact: <ContactEmail className="text-br-dk-sub hover:text-br-dk-text underline underline-offset-4" /></span>
          <TesterFeedback />
          {INSTAGRAM_URL && <a href={INSTAGRAM_URL} {...ext} className={`${link} inline-flex items-center gap-1.5`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
            </svg>Instagram</a>}
        </nav>
        <p className="text-br-dk-sub shrink-0">
          Designed by <a href="https://ryanedwardmediagroup.com" {...ext} className="underline underline-offset-4 hover:text-br-dk-text transition-colors">Ryan Edward Media Group</a>
        </p>
      </div>
    </footer>
  )
}
