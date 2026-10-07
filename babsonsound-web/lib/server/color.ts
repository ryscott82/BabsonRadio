import 'server-only'

/** A scheduler-picked color: "#rrggbb", or '' for the default. */
export const cleanColor = (v: unknown) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : ''
