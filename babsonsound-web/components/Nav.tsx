'use client'

import { avatarHex, discStyle } from '@/lib/profile'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'
import { useState } from 'react'
import { useLiveBundle } from '@/lib/liveStore'
import ThemeToggle from './ThemeToggle'
import { LINKS } from '@/lib/links'
import { activeHref, linksFor, profileMenu } from '@/lib/siteNav'

export default function Nav() {
  const { user, userDoc, isAdmin, isDirector, isBabson, isGuest } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)      // profile menu
  const [mobileOpen, setMobileOpen] = useState(false)  // hamburger menu on phones
  // Whether they host anything comes from their own half of the live bundle (lib/liveStore.ts), only that piece, every 2 minutes. No shared data is fetched here.
  const live = useLiveBundle({ shared: false, sections: user && isBabson ? ['host'] : [] })
  const hosting = !!user && isBabson && !!live.me?.host?.hosting // a show of theirs is on today
  const avatarId = typeof userDoc?.avatarColor === 'string' ? userDoc.avatarColor : undefined
  const initials = (() => {
    const first = (userDoc?.firstName ?? userDoc?.displayName ?? user?.displayName ?? user?.email ?? 'U').trim()
    const last = (userDoc?.lastName ?? '').trim()
    return ((first[0] ?? 'U') + (last[0] ?? '')).toUpperCase()
  })()
  if (pathname === '/coming-soon' || pathname.startsWith('/admin') || pathname.startsWith('/booth')) return null

  const showHost = hosting && !isGuest
  const links = linksFor({ isGuest, hosting: showHost }) // guests: Live and Members
  const showAdmin = isAdmin || isDirector
  const canRequest = isBabson
  const active = (href: string) => activeHref(pathname, href)
  const item = 'block px-4 py-3 text-sm text-br-dk-text hover:bg-br-dk-surface2 transition-colors'
  const menuLinks = profileMenu({ isStudent: canRequest, isGuest, staff: showAdmin })
  const close = () => { setMenuOpen(false); setMobileOpen(false) }

  return (
    <header className="art-nav hw-bar fixed top-0 inset-x-0 z-50">
      <div className="max-w-6xl lg:max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 h-16 flex items-center gap-8">

        {/* Wordmark */}
        <Link href="/" className="flex items-baseline gap-2.5 shrink-0" style={{ fontFamily: "'Barlow Semi Condensed', 'Arial Narrow', system-ui, sans-serif" }}>
          <span className="text-br-gold text-base font-semibold tracking-[0.14em]">Babson</span>
          <span className="text-br-dk-text text-[1.7rem] font-bold tracking-[0.14em] leading-none">Radio</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href) ? 'page' : undefined}
              className={`${active(link.href) ? 'sk-key hw-pill text-br-gold' : 'text-br-dk-text hover:text-br-gold'} text-[17px] font-semibold px-4 h-10 inline-flex items-center justify-center leading-none rounded-xl transition-colors`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {canRequest && !isGuest && (
            <Link href="/slots"
                  style={{ '--hw-key-tint': 'linear-gradient(rgba(14,143,97,.38), rgba(14,143,97,.38))' } as React.CSSProperties}
                  className="hidden md:inline-flex sk-key hw-pill items-center justify-center leading-none h-9 px-4 rounded-full text-sm font-semibold">Host a show</Link>
          )}
          <a href={LINKS.join} target="_blank" rel="noopener noreferrer"
             style={{ '--hw-key-tint': 'linear-gradient(rgba(14,143,97,.38), rgba(14,143,97,.38))' } as React.CSSProperties}
             className="hidden md:inline-flex sk-key hw-pill items-center justify-center leading-none h-9 px-4 rounded-full text-sm font-semibold">Join Babson Sound</a>
          <ThemeToggle />

          {user ? (
            <div className="relative">
              <button
                onClick={() => { setMenuOpen(!menuOpen); setMobileOpen(false) }}
                aria-label="Profile menu"
                aria-expanded={menuOpen}
                className="hw-disc w-9 h-9 flex items-center justify-center font-display text-sm select-none"
                style={discStyle(avatarHex(avatarId))}
              >
                <span className="relative z-[1]">{initials}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 sk-raised rounded-xl overflow-hidden">
                  <Link href="/profile" onClick={close} className={item}>Profile</Link>
                  {menuLinks.filter(l => l.href !== '/profile').map(l => (
                    <Link key={l.href} href={l.href} onClick={close} className={`${item} border-t border-br-dk-border`}>{l.label}</Link>
                  ))}
                  {isGuest && <Link href="/delete-account" onClick={close} className={item}>Delete account</Link>}
                  <button
                    onClick={() => { signOut(); close() }}
                    className={`w-full text-left px-4 py-3 text-sm text-br-dk-sub hover:text-br-dk-text hover:bg-br-dk-surface2 transition-colors ${isGuest ? '' : 'border-t border-br-dk-border'}`}
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
          {links.map(link => (
            <Link key={link.href} href={link.href} onClick={close}
              className="font-display tracking-widest text-sm text-br-dk-sub hover:text-br-dk-text py-2">
              {link.label}
            </Link>
          ))}
          {canRequest && !isGuest && (
            <Link href="/slots" onClick={close} className="font-display tracking-widest text-sm text-br-dk-sub hover:text-br-dk-text py-2">Host a show</Link>
          )}
        </div>
      )}
    </header>
  )
}
