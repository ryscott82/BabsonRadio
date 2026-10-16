import { avatarHex } from '@/lib/profile'

/** A colored circle with the person's first initial. No photos. */
export default function Avatar({ name, color, size = 72 }: { name: string; color?: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full font-display text-white select-none"
          style={{ width: size, height: size, background: avatarHex(color), fontSize: size * 0.46 }} aria-hidden>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}
