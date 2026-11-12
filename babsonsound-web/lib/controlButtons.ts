import type { OpsIcon } from '@/components/admin/OpsIcons'

// The row of icon buttons on the home page. Pure, so the tests can check that every button has a name and a tooltip,
// and that the Admin-only ones are never in an E-board list.

export type ControlId = 'skip' | 'emergency-stop' | 'resume' | 'sign' | 'color' | 'announce' | 'next' | 'more'
export interface ControlButton {
  id: ControlId
  /** The accessible name (aria-label), the tooltip title and the small caption on phones. */
  label: string
  /** One short line for the tooltip. */
  tip: string
  icon: OpsIcon
  /** A switch: its icon is filled while it is on. */
  toggle?: boolean
  red?: boolean
  admin?: boolean
}

export const CONTROL_BUTTONS: ControlButton[] = [
  { id: 'skip', label: 'Skip song', tip: 'Go to the next song', icon: 'skip' },
  { id: 'emergency-stop', label: 'Emergency stop', tip: 'Take the station off air', icon: 'stop', red: true },
  { id: 'resume', label: 'Resume', tip: 'Bring the station back', icon: 'resume' },
  { id: 'sign', label: 'ON AIR sign', tip: 'The light in the studio', icon: 'sign', toggle: true },
  { id: 'color', label: 'Color mode', tip: 'Album colors at night', icon: 'color', toggle: true },
  { id: 'announce', label: 'Announcement', tip: 'A message on every page', icon: 'announce', toggle: true },
  { id: 'next', label: 'Play a song next', tip: 'Pick the next song', icon: 'next' },
  { id: 'more', label: 'More', tip: 'Audio processing and maintenance', icon: 'more', admin: true },
]

/** The buttons one role sees. "More" (audio processing and maintenance) is Admin only and is not in the E-board list at all. */
export const buttonsFor = (role: 'director' | 'admin'): ControlButton[] => CONTROL_BUTTONS.filter(b => role === 'admin' || !b.admin)

export interface MoreSwitch { id: 'audio-fx' | 'maintenance'; label: string; tip: string; icon: OpsIcon }
export const MORE_SWITCHES: MoreSwitch[] = [
  { id: 'audio-fx', label: 'Audio processing', tip: 'The website equalizer and volume boost', icon: 'tests' },
  { id: 'maintenance', label: 'Maintenance mode', tip: 'Tells listeners we will be back shortly', icon: 'auto' },
]
