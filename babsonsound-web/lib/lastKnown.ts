// Small per-instance memory used to answer "again?" requests without doing the work again. Pure, so the tests can run it.
//
//   remember(key, value)            keep the last answer for this key
//   recall(key, maxAgeMs)           that answer, if it is younger than maxAgeMs
//   allow(key, minGapMs)            true (and note the time) if this key has not been served within minGapMs
// Used for the old app routes (one person polling every few seconds), the throttled features, and the listening check-in.

export interface LastKnown<T> {
  remember(key: string, value: T, now?: number): void
  recall(key: string, maxAgeMs: number, now?: number): T | undefined
  peek(key: string): { at: number; value: T } | undefined
  allow(key: string, minGapMs: number, now?: number): boolean
  forget(key: string): void
  clear(): void
  size(): number
}

export function createLastKnown<T = unknown>(max = 3000): LastKnown<T> {
  const m = new Map<string, { at: number; value: T }>()
  const put = (key: string, value: T, now: number) => {
    m.delete(key) // re-insert so the oldest entries are at the front
    m.set(key, { at: now, value })
    if (m.size > max) { const first = m.keys().next().value; if (first !== undefined) m.delete(first) }
  }
  return {
    remember: (key, value, now = Date.now()) => put(key, value, now),
    recall: (key, maxAgeMs, now = Date.now()) => { const h = m.get(key); return h && now - h.at < maxAgeMs ? h.value : undefined },
    peek: key => m.get(key),
    allow(key, minGapMs, now = Date.now()) {
      const h = m.get(key)
      if (h && now - h.at < minGapMs) return false
      put(key, h?.value as T, now)
      return true
    },
    forget: key => { m.delete(key) },
    clear: () => m.clear(),
    size: () => m.size,
  }
}
