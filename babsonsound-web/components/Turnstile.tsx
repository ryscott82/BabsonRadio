'use client'

import { useEffect, useRef } from 'react'

// Cloudflare Turnstile check, shown only when the server says something about a sign-up looks off (BR-ACC-022).
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is the public site key. Without it nothing is shown and the server lets the sign-up through.
type Api = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void }
declare global { interface Window { turnstile?: Api } }
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  useEffect(() => {
    if (!siteKey || !box.current) return
    let id: string | null = null
    let dead = false
    const mount = () => {
      if (dead || !box.current || !window.turnstile) return
      id = window.turnstile.render(box.current, {
        sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
      })
    }
    if (window.turnstile) mount()
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
      if (!s) { s = document.createElement('script'); s.src = SRC; s.async = true; document.head.appendChild(s) }
      s.addEventListener('load', mount)
    }
    return () => { dead = true; if (id && window.turnstile) window.turnstile.remove(id) }
  }, [siteKey, onToken])
  if (!siteKey) return null
  return <div ref={box} className="flex justify-center" />
}
