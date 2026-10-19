import { avatarHex, discStyle } from '@/lib/profile'

/** Two-letter initials from a full name (or one letter from a single name). */
export const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

/** A brushed-metal disc tinted with the person's color, initials engraved in it. No photos. */
export default function Avatar({ name, color, size = 72 }: { name: string; color?: string; size?: number }) {
  const bg = avatarHex(color)
  return (
    <span className="hw-disc inline-flex items-center justify-center font-display select-none"
          style={{ width: size, height: size, fontSize: size * (name.trim().split(/\s+/).length > 1 ? 0.4 : 0.5), ...discStyle(bg) }} aria-hidden>
      <span className="relative z-[1]">{initialsOf(name)}</span>
    </span>
  )
}
