'use client'

import { avatarHex, avatarInk } from '@/lib/profile'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'
import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import ThemeToggle from './ThemeToggle'
import { LINKS } from '@/lib/links'

// Five links in the bar. Everything else (profile, requesting a spot, host panel, admin) lives in the profile menu.
const NAV_LINKS = [
  { href: '/', label: 'Live' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/library', label: 'Library' },
  { href: '/browse', label: 'Search' },
  { href: '/submit', label: 'Suggest' },
]

export default function Nav() {
  const HOST_LINK = { href: '/host', label: 'Host' }
  const { user, userDoc, isAdmin, isDirector, isBabson, isDeveloper, isGuest, isHost } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)      // profile menu
  const [mobileOpen, setMobileOpen] = useState(false)  // hamburger menu on phones
  const [hosting, setHosting] = useState(false) // a show of theirs is on air or about to be (controls window is open)
  useEffect(() => {
    if (!user || !(isBabson || isDeveloper)) { queueMicrotask(() => setHosting(false)); return }
    const load = () => apiGet<{ hosting: boolean }>('/api/host/access').then(r => setHosting(r.hosting)).catch(() => setHosting(false))
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 60_000)
    return () => clearInterval(t)
  }, [user, isBabson, isDeveloper])
  const avatarId = typeof userDoc?.avatarColor === 'string' ? userDoc.avatarColor : undefined
  const initials = (() => {
    const first = (userDoc?.firstName ?? userDoc?.displayName ?? user?.displayName ?? user?.email ?? 'U').trim()
    const last = (userDoc?.lastName ?? '').trim()
    return ((first[0] ?? 'U') + (last[0] ?? '')).toUpperCase()
  })()
  if (pathname === '/coming-soon') return null

  const showHost = hosting
  const showAdmin = isAdmin || isDirector
  const canRequest = isBabson || isDeveloper
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))
  const item = 'block px-4 py-3 text-sm text-br-dk-text hover:bg-br-dk-surface2 transition-colors'
  const close = () => { setMenuOpen(false); setMobileOpen(false) }

  return (
    <header className="art-nav hw-bar fixed top-0 inset-x-0 z-50">
      <div className="max-w-6xl lg:max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 h-16 flex items-center gap-8">

        {/* Wordmark */}
        <Link href="/" className="flex items-baseline gap-2.5 shrink-0" style={{ fontFamily: "'Barlow', system-ui, sans-serif" }}>
          <span className="text-br-gold text-[11px] font-semibold tracking-[0.34em]">BABSON</span>
          <span className="text-br-dk-text text-[1.6rem] font-bold tracking-[0.32em] leading-none">RADIO</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {(showHost ? [...NAV_LINKS, HOST_LINK] : NAV_LINKS).map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href) ? 'page' : undefined}
              className={`${active(link.href) ? 'sk-key hw-pill text-br-gold' : 'text-br-dk-text hover:text-br-gold'} text-[15px] font-semibold px-4 py-1.5 rounded-xl transition-colors`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <a href={LINKS.join} target="_blank" rel="noopener noreferrer"
             className="hidden md:inline-flex sk-key hw-pill items-center h-9 px-4 rounded-full text-sm font-semibold">Join Babson Sound</a>
          <ThemeToggle />

          {user ? (
            <div className="relative">
              <button
                onClick={() => { setMenuOpen(!menuOpen); setMobileOpen(false) }}
                aria-label="Profile menu"
                aria-expanded={menuOpen}
                className="rounded-full w-9 h-9 flex items-center justify-center font-display text-sm select-none"
                style={{ background: avatarHex(avatarId), color: avatarInk(avatarHex(avatarId)) }}
              >
                {initials}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 sk-raised rounded-xl overflow-hidden">
                  <Link href="/profile" onClick={close} className={item}>Profile</Link>
                  {canRequest && <Link href="/slots" onClick={close} className={`${item} border-t border-br-dk-border`}>Request a spot</Link>}
                  {isBabson && <Link href="/guest-access" onClick={close} className={`${item} border-t border-br-dk-border`}>Invite friends</Link>}
                  {isGuest && <Link href="/auth/guest" onClick={close} className={`${item} border-t border-br-dk-border`}>My guest access</Link>}
                  {showAdmin && <Link href="/admin" onClick={close} className={`${item} border-t border-br-dk-border`}>Radio operations</Link>}
                  <button
                    onClick={() => { signOut(); close() }}
                    className="w-full text-left px-4 py-3 text-sm text-br-dk-sub hover:text-br-dk-text hover:bg-br-dk-surface2 transition-colors border-t border-br-dk-border"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth" className="sk-key hw-pill text-sm font-semibold px-4 h-9 inline-flex items-center rounded-full">
              Sign in
            </Link>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden text-br-dk-sub"
            aria-label="Menu"
            aria-expanded={mobileOpen}
            onClick={() => { setMobileOpen(!mobileOpen); setMenuOpen(false) }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown: just the four links; the rest is under the profile circle */}
      {mobileOpen && (
        <div className="md:hidden bg-br-dk-surface border-t border-br-dk-border px-4 py-3 flex flex-col gap-1">
          {(showHost ? [...NAV_LINKS, HOST_LINK] : NAV_LINKS).map(link => (
            <Link key={link.href} href={link.href} onClick={close}
              className="font-display tracking-widest text-sm text-br-dk-sub hover:text-br-dk-text py-2">
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
