// Shared by the website, the server and (mirrored) the iOS app.

/** Bump when the terms or privacy policy change in a way people should re-accept. */
export const TERMS_VERSION = '2026-10-07'

/** The graduation year of the class that is seniors this school year. The school year turns over in July, so it updates itself. */
export const schoolYearBase = (now = new Date()) => now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0)

/** Graduation choices: the four classes on campus now (this year's seniors through freshmen), prospective students, alumni and staff. */
export function gradYearOptions(now = new Date()): { value: string; label: string }[] {
  const base = schoolYearBase(now)
  return [
    ...Array.from({ length: 4 }, (_, i) => ({ value: String(base + i), label: `Class of ${base + i}` })),
    { value: 'prospective', label: 'Prospective student' },
    { value: 'alumni', label: 'Alumni' },
    { value: 'staff', label: 'Faculty or staff' },
  ]
}

export function validGradYear(v: string, now = new Date()): boolean {
  if (v === 'alumni' || v === 'staff' || v === 'prospective') return true
  const base = schoolYearBase(now)
  return /^\d{4}$/.test(v) && Number(v) >= base - 1 && Number(v) <= base + 3
}

/** Best guess at a graduation choice from a birthday (month is optional): most people finish at 22, a fall birthday a year later. '' = no guess. */
export function guessGradYear(birthYear: number, birthMonth: number | null, now = new Date()): string {
  const base = schoolYearBase(now)
  const g = birthYear + 22 + (birthMonth != null && birthMonth >= 9 ? 1 : 0)
  if (g < base - 2) return ''
  if (g < base) return String(base)
  return g <= base + 3 ? String(g) : 'prospective'
}

export const normText = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60)

/** Concentrations people can pick. Paste the official list here; while it is empty the profile shows a text box. */
export const CONCENTRATIONS: string[] = []
export const MAX_CONCENTRATIONS = 2
