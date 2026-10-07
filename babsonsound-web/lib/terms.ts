// Shared by the website, the server and (mirrored) the iOS app.

/** Bump when the terms or privacy policy change in a way people should re-accept. */
export const TERMS_VERSION = '2026-10-07'

/** Graduation year choices: this year through six years out, plus alumni and staff. */
export function gradYearOptions(now = new Date()): { value: string; label: string }[] {
  const y = now.getFullYear()
  return [
    ...Array.from({ length: 7 }, (_, i) => ({ value: String(y + i), label: `Class of ${y + i}` })),
    { value: 'alumni', label: 'Alumni' },
    { value: 'staff', label: 'Faculty or staff' },
  ]
}

export function validGradYear(v: string, now = new Date()): boolean {
  if (v === 'alumni' || v === 'staff') return true
  const n = Number(v)
  return /^\d{4}$/.test(v) && n >= now.getFullYear() - 1 && n <= now.getFullYear() + 8
}

export const normText = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60)

/** Concentrations people can pick. Paste the official list here; while it is empty the profile shows a text box. */
export const CONCENTRATIONS: string[] = []
export const MAX_CONCENTRATIONS = 2
