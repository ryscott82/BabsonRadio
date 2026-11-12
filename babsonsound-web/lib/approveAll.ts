// "Approve all" on the Today page: the list the person confirmed (their exact ids) is approved one at a time, soonest show first, with the same
// approval the single Approve button uses. Pure orchestration (the database work is passed in), so the tests can prove what it touches.

export const APPROVE_ALL_MAX = 50

export type ApproveResult = { id: string; ok: true } | { id: string; ok: false; reason: string }

/** The ids from the request: a non-empty list of text ids, no repeats, at most 50. Anything else is an error message. */
export function cleanIds(v: unknown): { ids: string[] } | { error: string } {
  if (!Array.isArray(v) || !v.length) return { error: 'Send the ids you confirmed.' }
  const ids = [...new Set(v.map(x => (typeof x === 'string' ? x.trim() : '')))]
  if (ids.some(x => !x || x.length > 100 || x.includes('/'))) return { error: 'One of the ids is not valid.' }
  if (ids.length > APPROVE_ALL_MAX) return { error: `Approve up to ${APPROVE_ALL_MAX} at a time.` }
  return { ids }
}

export interface ApproveAllDeps<M> {
  /** What each id is right now (null when there is no such request). */
  peek(ids: string[]): Promise<Map<string, { status: string; startAt: number } | null>>
  /** The shared approval (approveRequest). Throws when it cannot approve. */
  approve(id: string): Promise<M>
  /** Plain-words reason for a thrown error. */
  reasonOf(e: unknown): string
  /** After each approval (the decision email). Must not throw. */
  afterApproved(mail: M): void
  /** Called once at the end, only if at least one request was approved. */
  rebuild(): Promise<void>
}

export async function approveAll<M>(ids: string[], d: ApproveAllDeps<M>): Promise<{ results: ApproveResult[]; approved: number }> {
  const seen = await d.peek(ids) // only the ids given are ever looked at
  const order = [...ids].sort((a, b) => (seen.get(a)?.startAt ?? Infinity) - (seen.get(b)?.startAt ?? Infinity))
  const results: ApproveResult[] = []
  let approved = 0
  for (const id of order) {
    const row = seen.get(id)
    if (!row) { results.push({ id, ok: false, reason: 'not found' }); continue }
    if (row.status !== 'pending') { results.push({ id, ok: false, reason: 'already handled' }); continue }
    try {
      const mail = await d.approve(id)
      approved++
      results.push({ id, ok: true })
      d.afterApproved(mail)
    } catch (e) {
      results.push({ id, ok: false, reason: d.reasonOf(e) })
    }
  }
  if (approved) await d.rebuild() // once, not once per show
  return { results, approved }
}
