// Which station buttons E-board (stored role `director`) can press, and which stay Admin only. One list for the route, the page and the tests.

/** E-board and Admins: stop and start the stream, ON AIR sign, message to everyone, album-art colour mode. (Skip is the per-song "next".) */
export const EBOARD_ACTIONS = ['skip', 'emergency-stop', 'resume', 'on-air-sign', 'announce', 'clear-announcement', 'color-mode'] as const
/** Admins only: audio processing and maintenance mode (what the stream does to the sound and what the site says while it is down). */
export const ADMIN_ACTIONS = ['audio-fx', 'maintenance'] as const

export type EboardAction = (typeof EBOARD_ACTIONS)[number]
export type AdminAction = (typeof ADMIN_ACTIONS)[number]

export const isEboardAction = (a: unknown): a is EboardAction => (EBOARD_ACTIONS as readonly unknown[]).includes(a)
export const isAdminAction = (a: unknown): a is AdminAction => (ADMIN_ACTIONS as readonly unknown[]).includes(a)

/** 'ok' | 'forbidden' (known, but Admin only) | 'unknown'. */
export function controlAccess(level: string, action: unknown): 'ok' | 'forbidden' | 'unknown' {
  if (isEboardAction(action)) return level === 'admin' || level === 'director' ? 'ok' : 'forbidden'
  if (isAdminAction(action)) return level === 'admin' ? 'ok' : 'forbidden'
  return 'unknown'
}

/** What the controls list returns to each role. E-board does not get the Admin-only states. */
export const CONTROL_FIELDS = {
  director: ['configured', 'nowPlaying', 'shows', 'announcement', 'onAirSign', 'colorMode'],
  admin: ['configured', 'nowPlaying', 'shows', 'announcement', 'onAirSign', 'colorMode', 'audioFx', 'maintenance'],
} as const
