// Fallback artwork when an item has no picture: a gradient picked from its title, so the same genre
// always looks the same. (iOS mirror: GenreArt in SlotsView.swift)
const PAIRS: [string, string][] = [
  ['#003D27', '#006644'], ['#00402B', '#0B7A55'], ['#0A3322', '#14704D'],
  ['#003D27', '#1C8560'], ['#06301F', '#0F6B48'], ['#0F2E22', '#1F7A58'],
]

export function genreArt(title: string): { background: string; initial: string } {
  let h = 0
  for (const ch of title.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [a, b] = PAIRS[h % PAIRS.length]
  return { background: `linear-gradient(135deg, ${a}, ${b})`, initial: (title.trim()[0] ?? '♪').toUpperCase() }
}
