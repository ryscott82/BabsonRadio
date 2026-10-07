'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'
import { useState } from 'react'
import ThemeToggle from './ThemeToggle'
import { INSTAGRAM_URL, LINKS } from '@/lib/links'

export default function Nav() {
  const { user, userDoc, isAdmin, isBabson, isGuest } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  if (pathname === '/coming-soon') return null

  const navLinks = [
    { href: '/',        label: 'Live' },
    { href: '/schedule', label: 'Schedule' },
    { href: '/shows',   label: 'Shows' },
    { href: '/browse',  label: 'Browse' },
    { href: '/slots',   label: 'Go On Air' },
  ]

  // Belong pages open in a new tab.
  const externalLinks = [
    { href: LINKS.about,  label: 'About Us' },
    { href: LINKS.events, label: 'Events' },
  ]

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-br-dk-bg/90 backdrop-blur border-b border-br-dk-border shadow-[0_2px_0_rgba(var(--sk-rgb),0.06)]">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-8">

        {/* Wordmark */}
        <Link href="/" className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-display text-br-gold text-sm tracking-[0.3em]">BABSON</span>
          <span className="font-display text-br-dk-text text-xl tracking-[0.3em]">RADIO</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-display tracking-widest text-sm px-4 py-2 rounded-md transition-colors ${
                pathname === link.href
                  ? 'text-br-gold bg-br-dk-surface'
                  : 'text-br-dk-sub hover:text-br-dk-text hover:bg-br-dk-surface'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {externalLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display tracking-widest text-sm px-4 py-2 rounded-md transition-colors text-br-dk-sub hover:text-br-dk-text hover:bg-br-dk-surface"
            >
              {link.label}
            </a>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className={`font-display tracking-widest text-sm px-4 py-2 rounded-md transition-colors ${
                pathname.startsWith('/admin')
                  ? 'text-br-gold bg-br-dk-surface'
                  : 'text-br-dk-sub hover:text-br-dk-text hover:bg-br-dk-surface'
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {INSTAGRAM_URL && (
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Babson Sound on Instagram"
               className="sk-key rounded-lg w-9 h-9 flex items-center justify-center text-br-dk-sub">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>
            </a>
          )}
          <ThemeToggle />
          {/* ON AIR badge */}
          <div className="hidden sm:flex items-center gap-1.5 bg-br-red px-2.5 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
            <span className="font-display text-white text-xs tracking-[0.2em]">On Air</span>
          </div>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                aria-pressed={menuOpen} className="sk-key flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
              >
                <span className="w-6 h-6 rounded-full bg-br-green flex items-center justify-center font-display text-white text-xs">
                  {(userDoc?.displayName ?? user.email ?? 'U')[0].toUpperCase()}
                </span>
                <span className="text-br-dk-sub text-xs hidden sm:block">
                  {userDoc?.displayName ?? user.email}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 sk-raised rounded-xl overflow-hidden">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-sm text-br-dk-text hover:bg-br-dk-surface2 transition-colors"
                  >
                    Profile
                  </Link>
                  {isBabson && (
                    <Link
                      href="/guest-access"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-br-dk-text hover:bg-br-dk-surface2 transition-colors border-t border-br-dk-border"
                    >
                      Guest access
                    </Link>
                  )}
                  {isGuest && (
                    <Link
                      href="/auth/guest"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-br-dk-text hover:bg-br-dk-surface2 transition-colors border-t border-br-dk-border"
                    >
                      My guest access
                    </Link>
                  )}
                  <button
                    onClick={() => { signOut(); setMenuOpen(false) }}
                    className="w-full text-left px-4 py-3 text-sm text-br-dk-sub hover:text-br-dk-text hover:bg-br-dk-surface2 transition-colors border-t border-br-dk-border"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="sk-btn font-display tracking-widest text-sm px-4 py-2 rounded-lg"
            >
              Sign In
            </Link>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden text-br-dk-sub"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-br-dk-surface border-t border-br-dk-border px-4 py-3 flex flex-col gap-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="font-display tracking-widest text-sm text-br-dk-sub hover:text-br-dk-text py-2"
            >
              {link.label}
            </Link>
          ))}
          {externalLinks.map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
               className="font-display tracking-widest text-sm text-br-dk-sub hover:text-br-dk-text py-2">
              {link.label}
            </a>
          ))}
          <a href={LINKS.join} target="_blank" rel="noopener noreferrer"
             className="font-display tracking-widest text-sm text-br-gold py-2">
            Join Babson Sound
          </a>
          {isAdmin && (
            <Link href="/admin" onClick={() => setMenuOpen(false)}
              className="font-display tracking-widest text-sm text-br-dk-sub hover:text-br-dk-text py-2">
              Admin
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
