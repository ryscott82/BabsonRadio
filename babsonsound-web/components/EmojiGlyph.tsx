/* eslint-disable @next/next/no-img-element */
'use client'

import { useArtMain } from '@/components/ArtTheme'

// iOS heart emoji and their approximate colors, for matching the heart to the album-art color.
const HEARTS: [string, [number, number, number]][] = [
  ['❤️', [221, 46, 68]], ['🧡', [244, 144, 12]], ['💛', [253, 203, 88]], ['💚', [119, 178, 85]], ['💙', [85, 172, 238]],
  ['💜', [170, 142, 214]], ['🤎', [193, 105, 79]], ['🩷', [244, 166, 192]], ['🩵', [141, 220, 234]],
]
function nearestHeart(hex: string): string {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  let best = HEARTS[0][0], bd = Infinity
  for (const [e, [R, G, B]] of HEARTS) {
    const rm = (r + R) / 2, d = (2 + rm / 256) * (r - R) ** 2 + 4 * (g - G) ** 2 + (2 + (255 - rm) / 256) * (b - B) ** 2
    if (d < bd) { bd = d; best = e }
  }
  return best
}

// A reaction, drawn: normal emoji as text, the beaver logo (":br:") as the logo image, and the Pittsburgh set (":pgh-*:") as drawings.
export default function EmojiGlyph({ e, size }: { e: string; size?: number | string }) {
  const { main } = useArtMain()
  if ((e === '❤️' || e === '❤') && /^#[0-9a-f]{6}$/i.test(main)) return <>{nearestHeart(main)}</>
  if (e === ':br:') return <img src="/beaver.png" alt="" draggable={false} style={{ height: size ?? '1.25em', width: 'auto', display: 'inline-block' }} />
  if (/^:pgh-[a-z]+:$/.test(e)) return <img src={`/pgh/${e.slice(5, -1)}.svg`} alt="" draggable={false} style={{ height: size ?? '1.25em', width: 'auto', display: 'inline-block' }} />
  return <>{e}</>
}
