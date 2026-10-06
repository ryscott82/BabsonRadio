// Shared between server routes and UI.
export const GUEST_DURATIONS = {
  '24h': { label: '24 hours' },
  '7d': { label: '7 days' },
  '30d': { label: '30 days' },
  semester: { label: 'Until end of semester' },
} as const

export type GuestDuration = keyof typeof GUEST_DURATIONS
export const GUEST_DURATION_KEYS = Object.keys(GUEST_DURATIONS) as GuestDuration[]
export const MAX_ACTIVE_GUESTS_PER_STUDENT = 10
