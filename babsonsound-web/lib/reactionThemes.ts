// Reaction rows that change with the music. Mac Miller is from Pittsburgh, so while he is on, the usual four become Pittsburgh.
// The pictures are our own simple drawings (public/pgh/*.svg, and the matching ones in the iOS app), not team logos.
export const PITTSBURGH = [':pgh-bridge:', ':pgh-helmet:', ':pgh-pirate:', ':pgh-heart:'] as const

/** The reactions to show for this artist, or null for the usual ones. */
export function reactionTheme(artist: string | undefined | null): readonly string[] | null {
  return /mac\s*miller/i.test(artist ?? '') ? PITTSBURGH : null
}
