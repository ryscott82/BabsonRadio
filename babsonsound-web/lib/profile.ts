// Shared by the website, the API and (mirrored by hand) the iOS app.

/** The six profile colors a member can pick. The ids are what gets saved. */
export const AVATAR_COLORS = [
  { id: 'green', hex: '#2E7D57' },
  { id: 'teal', hex: '#2A8C8C' },
  { id: 'blue', hex: '#3B6FB6' },
  { id: 'plum', hex: '#7B4B94' },
  { id: 'rust', hex: '#B5543A' },
  { id: 'slate', hex: '#556070' },
] as const
export type AvatarColorId = (typeof AVATAR_COLORS)[number]['id']
export const DEFAULT_AVATAR: AvatarColorId = 'green'
export const avatarHex = (id: string | undefined) => AVATAR_COLORS.find(c => c.id === id)?.hex ?? AVATAR_COLORS[0].hex

/** What a host picks for their own shows (Go on air, bottom of the page). */
export type HostTheme = 'auto' | 'standard' | 'art'
export interface HostPrefs { theme: HostTheme; emojis: string[]; ratings: boolean }
export const MAX_HOST_EMOJIS = 6
export const DEFAULT_HOST_PREFS: HostPrefs = { theme: 'auto', emojis: [], ratings: true }

/** A short list of reactions to pick from, so nobody has to find an emoji keyboard. */
export const EMOJI_CHOICES = ['🔥', '❤️', '🦫', '🤘', '🎉', '😂', '👏', '🙌', '💃', '🕺', '🎶', '✨', '😍', '🤯', '💯', '🥳', '😎', '🌟', '🙏', '🎧', '🫶', '🍿', '🥹', '🤩'] as const
