import { avatarHex, avatarInk } from '@/lib/profile'

/** Two-letter initials from a full name (or one letter from a single name). */
export const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

/** A colored circle with the person's initials. No photos. */
export default function Avatar({ name, color, size = 72 }: { name: string; color?: string; size?: number }) {
  const bg = avatarHex(color)
  return (
    <span className="inline-flex items-center justify-center rounded-full font-display select-none"
          style={{ width: size, height: size, background: bg, color: avatarInk(bg), fontSize: size * 0.4 }} aria-hidden>
      {initialsOf(name)}
    </span>
  )
}
