// Reaction rows that change with the music are rules an admin edits (Admin > Easter eggs), served from /api/live/easter-eggs.
// The built-in pictures are in public/pgh (PNG artwork), with matching ones in the iOS app.
export const PITTSBURGH = [':pgh-bridge:', ':pgh-helmet:', ':pgh-stadium:', ':pgh-heart:'] as const

export interface EggRule { id: string; artist: string[]; title: string[]; show: string[]; emojis: string[] }

/** The reactions for what is playing under the first matching rule, or null for the usual ones. */
export function reactionTheme(
  eggs: readonly EggRule[], now: { artist?: string | null; title?: string | null; showTitle?: string | null } | null | undefined,
): readonly string[] | null {
  if (!now) return null
  const a = (now.artist ?? '').toLowerCase(), t = (now.title ?? '').toLowerCase(), s = (now.showTitle ?? '').toLowerCase()
  for (const e of eggs) {
    const hit = (needles: string[], hay: string) => needles.length > 0 && !!hay && needles.some(n => hay.includes(n))
    if (hit(e.artist, a) || hit(e.title, t) || hit(e.show, s)) return e.emojis
  }
  return null
}
