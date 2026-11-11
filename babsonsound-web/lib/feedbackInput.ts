// Cleans what the apps send to /api/feedback: a bug, a feature idea, or a report of content or a person.
// Plain functions (no server imports) so the tests can load them.

export type FeedbackType = 'bug' | 'feature' | 'report'
export type ReportTarget = { kind: 'content' | 'person' | 'other'; id: string; label: string }

export const FEEDBACK_TYPES: FeedbackType[] = ['bug', 'feature', 'report']
export const REPORT_KINDS = ['content', 'person', 'other'] as const
/** Reports per person per hour (bugs and ideas share the same count). */
export const FEEDBACK_PER_HOUR = 5

export const cleanType = (v: unknown): FeedbackType => (v === 'feature' || v === 'report' ? v : 'bug')

const trim = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** What was reported. Only for type "report"; anything missing or odd becomes an "other" report with no id. */
export function cleanTarget(v: unknown): ReportTarget {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const kind = (REPORT_KINDS as readonly string[]).includes(o.kind as string) ? (o.kind as ReportTarget['kind']) : 'other'
  return { kind, id: trim(o.id, 120), label: trim(o.label, 200) }
}

/** A report can be short (a reason is enough); a bug or idea needs a little more. */
export const minMessage = (t: FeedbackType) => (t === 'report' ? 3 : 5)

/** The line staff see in the push notification. */
export function pushTitle(t: FeedbackType, target?: ReportTarget): string {
  if (t === 'feature') return 'New feature idea'
  if (t === 'report') return target?.kind === 'person' ? 'New report about a person' : 'New content report'
  return 'New bug report'
}
