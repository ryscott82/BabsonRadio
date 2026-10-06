// Shared between server routes and UI.
export const SLOT_TYPES = {
  live: 'Live broadcast',
  prerecorded: 'Pre-recorded',
} as const
export type SlotType = keyof typeof SLOT_TYPES

export const SLOT_CATEGORIES = ['podcast', 'music', 'talk', 'interview', 'news', 'other'] as const
export type SlotCategory = (typeof SLOT_CATEGORIES)[number]

export const SLOT_RULES = {
  minLeadHours: 24,      // request at least a day ahead
  maxAdvanceDays: 60,
  minMinutes: 15,
  maxMinutes: 240,
  stepMinutes: 15,       // start time and length snap to 15 min
  maxPendingPerUser: 3,
} as const

export type SlotStatus = 'pending' | 'approved' | 'declined' | 'cancelled'
