import 'server-only'
import beats from '@/data/beats.json'

// Tempo + first-beat position per song, written by tools/analyze_beats.py into data/beats.json.
// Keyed by artist + title with everything but letters and digits dropped (same recipe as the script).

const norm = (x: string) => x.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** [bpm, firstBeatSeconds] for the song, or null when it hasn't been analyzed. */
export function lookupBeat(artist: string, title: string): { bpm: number; offset: number } | null {
  const hit = (beats as Record<string, number[]>)[`${norm(artist)}|${norm(title)}`]
  if (!hit || !(hit[0] >= 50 && hit[0] <= 220)) return null
  return { bpm: hit[0], offset: Math.max(0, hit[1] || 0) }
}
