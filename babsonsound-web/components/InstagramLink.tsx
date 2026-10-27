import { instagramUrl } from '@/lib/instagram'

/** A small Instagram glyph (outline camera). Decorative: the handle next to it is the label. */
export function InstagramIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** @handle with the Instagram icon, linking to instagram.com/handle in a new tab. Says nothing about whether the handle is checked. */
export default function InstagramLink({ handle, className = '' }: { handle: string; className?: string }) {
  if (!handle) return null
  return (
    <a href={instagramUrl(handle)} target="_blank" rel="noopener noreferrer"
       className={`inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-br-gold ${className}`}>
      <InstagramIcon />
      <span>@{handle}</span>
    </a>
  )
}
