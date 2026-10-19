// Shared by the website, the API and (mirrored by hand) the iOS app.

/** The profile colors a member can pick. The ids are what gets saved. */
export const AVATAR_COLORS = [
  { id: 'babson-green', hex: '#006644' },
  { id: 'courtyard', hex: '#597C31' },
  { id: 'sherwood', hex: '#9EB28F' },
  { id: 'alfresco', hex: '#567B8A' },
  { id: 'bright-gold', hex: '#DDD055' },
  { id: 'mango', hex: '#EEAF00' },
  { id: 'ochre', hex: '#AD9001' },
  { id: 'peacock', hex: '#368180' },
  { id: 'summer-nights', hex: '#005172' },
  { id: 'englewood', hex: '#6C6F70' },
  { id: 'daphne', hex: '#C7D28A' },
  { id: 'cedar-key', hex: '#DAD7CB' },
  { id: 'blue-heather', hex: '#C6D3D7' },
  { id: 'beach-haven', hex: '#EDE8C4' },
] as const
export type AvatarColorId = (typeof AVATAR_COLORS)[number]['id']
export const DEFAULT_AVATAR: AvatarColorId = 'babson-green'
export const avatarHex = (id: string | undefined) => AVATAR_COLORS.find(c => c.id === id)?.hex ?? AVATAR_COLORS[0].hex

/** True when dark letters read better on the metal disc. Mirrors the iOS app: judged on what the disc looks like once the tint is
 *  blended into the brushed steel (about 35% steel at 0.66 and 65% of the pick), so dark picks get light letters. */
export const avatarDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const mix = (c: number) => lin(0.35 * 0.66 * 255 + 0.65 * c)
  const L = 0.2126 * mix(n >> 16) + 0.7152 * mix((n >> 8) & 255) + 0.0722 * mix(n & 255)
  return (L + 0.05) * (L + 0.05) >= 0.064
}
/** Letter color on a profile disc. */
export const avatarInk = (hex: string) => (avatarDark(hex) ? '#22221F' : '#FAF6EC')

/** Inline style that turns an element with the `hw-disc` class into a brushed-metal disc tinted with this profile color. */
export const discStyle = (hex: string): Record<string, string> => ({
  '--tint': hex, color: avatarInk(hex), textShadow: avatarDark(hex) ? '0 1px 0 rgba(255,255,255,.5)' : '0 1px 0 rgba(0,0,0,.55)',
})

/** What a host picks for their own shows (Go on air, bottom of the page). */
export type HostTheme = 'auto' | 'standard' | 'art'
export interface HostPrefs { theme: HostTheme; emojis: string[]; ratings: boolean }
export const MAX_HOST_EMOJIS = 6
export const DEFAULT_HOST_PREFS: HostPrefs = { theme: 'auto', emojis: [], ratings: true }

/** A short list of reactions to pick from, so nobody has to find an emoji keyboard. */
export const EMOJI_CHOICES = ['🔥', '❤️', '🦫', '🤘', '🎉', '😂', '👏', '🙌', '💃', '🕺', '🎶', '✨', '😍', '🤯', '💯', '🥳', '😎', '🌟', '🙏', '🎧', '🫶', '🍿', '🥹', '🤩'] as const
