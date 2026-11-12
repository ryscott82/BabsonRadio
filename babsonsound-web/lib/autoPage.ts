import { ADMIN_FIELDS, DEFAULT_CONFIG, DIRECTOR_FIELDS, type AutoConfig } from './autoschedule.ts'

// The Auto DJ page (/admin/autoschedule): what each role sends and sees. Pure, so the tests cover it.
// Directors run the station (rules, default playlists, rule on/off, Preview, Rebuild, Schedule correction); Admins protect the machinery.
// The field lists are the server's own (DIRECTOR_FIELDS and ADMIN_FIELDS in lib/autoschedule.ts).

export type AutoRole = 'director' | 'admin'

/** The body of a save. A Director sends only the Director fields, even if the page holds more; an Admin sends everything. */
export function savePayload(cfg: AutoConfig, role: AutoRole): { config: Partial<AutoConfig> } {
  if (role === 'admin') return { config: cfg }
  const out: Record<string, unknown> = {}
  for (const k of DIRECTOR_FIELDS) out[k] = cfg[k]
  return { config: out as Partial<AutoConfig> }
}

/** A Director is sent only part of the config; the preview grid needs the rest, so it is filled with the defaults (never saved by a Director). */
export const fullConfig = (raw: Partial<AutoConfig>): AutoConfig => ({ ...DEFAULT_CONFIG, ...raw })

/** Only an Admin sees the Advanced section at all (it is not rendered for a Director, rather than disabled). */
export const showsAdvanced = (role: AutoRole | null) => role === 'admin'

/** Whether a field of the config is one a Director may change. */
export const directorMayChange = (field: string) => (DIRECTOR_FIELDS as readonly string[]).includes(field)
export const adminOnlyField = (field: string) => (ADMIN_FIELDS as readonly string[]).includes(field)

/** What a refused save says to a person: the server's own sentence for a 403, never a crash. */
export const plainSaveError = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Could not save. Try again.')
