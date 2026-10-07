// Fallback artwork when an item has no picture: a gradient picked from its title, so the same genre
// always looks the same. (iOS mirror: GenreArt in SlotsView.swift)
const PAIRS: [string, string][] = [
  ['#003D27', '#006644'], ['#1A2E4A', '#2E5C8A'], ['#2A1A08', '#5C3A10'],
  ['#1A0A2E', '#4A1A7A'], ['#2A0808', '#7A1A1A'], ['#0F2A2E', '#1F6F78'],
]

export function genreArt(title: string): { background: string; initial: string } {
  let h = 0
  for (const ch of title.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [a, b] = PAIRS[h % PAIRS.length]
  return { background: `linear-gradient(135deg, ${a}, ${b})`, initial: (title.trim()[0] ?? '♪').toUpperCase() }
}
