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

/** Letter color on a profile circle: dark on the light brand colors, white on the rest. */
export const avatarInk = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#1A1710' : '#FFFFFF'
}

/** What a host picks for their own shows (Go on air, bottom of the page). */
export type HostTheme = 'auto' | 'standard' | 'art'
export interface HostPrefs { theme: HostTheme; emojis: string[]; ratings: boolean }
export const MAX_HOST_EMOJIS = 6
export const DEFAULT_HOST_PREFS: HostPrefs = { theme: 'auto', emojis: [], ratings: true }

/** A short list of reactions to pick from, so nobody has to find an emoji keyboard. */
export const EMOJI_CHOICES = ['🔥', '❤️', '🦫', '🤘', '🎉', '😂', '👏', '🙌', '💃', '🕺', '🎶', '✨', '😍', '🤯', '💯', '🥳', '😎', '🌟', '🙏', '🎧', '🫶', '🍿', '🥹', '🤩'] as const
