import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Firestore, Query, Transaction } from '@google-cloud/firestore'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import { createMeter, wrapReads, type MinuteRow } from '../readMeterCore'

// TEMPORARY Firestore read meter. Counts documents read per API route, in memory, and logs one line per minute per instance
// ("[firestore-reads] {...}" in Vercel Logs). Adds no Firestore reads or writes. Turn off with READ_METER=0.
// Patch points are the ones every read goes through exactly once (DocumentReference.get -> Firestore.getAll, Query.get,
// and the Transaction / aggregate variants), so nothing is counted twice. Not DocumentReference.get, on purpose.

const als = new AsyncLocalStorage<{ path?: string }>()

function routeName(): string {
  try {
    const r = workAsyncStorage.getStore()?.route
    if (r) return r
  } catch { /* internal API moved: fall through */ }
  return als.getStore()?.path ?? 'unknown'
}

const meter = createMeter({
  route: () => ({ name: routeName(), key: als.getStore() ?? null }),
  log: l => console.log(l),
  instance: (process.env.VERCEL_DEPLOYMENT_ID ?? 'local').slice(-6) + '/' + Math.random().toString(16).slice(2, 6),
})

let installed = false
export function installReadMeter(db?: Firestore) {
  if (installed || process.env.READ_METER === '0') return
  installed = true
  try {
    const P = (c: { prototype: unknown }) => c.prototype as Record<string, unknown>
    wrapReads(P(Firestore), 'getAll', meter)
    wrapReads(P(Query), 'get', meter)
    wrapReads(P(Transaction), 'get', meter)
    wrapReads(P(Transaction), 'getAll', meter)
    // count() / aggregate() are billed at 1 read per 1000 index entries; they are counted as 1 here (an undercount for big collections).
    // The class is not exported by the SDK, so it is taken from a query object (creating one does no I/O).
    if (db) wrapReads(Object.getPrototypeOf(db.collection('_meter').count()) as Record<string, unknown>, 'get', meter)
  } catch (e) { console.warn('[firestore-reads] could not install', e) }
}

/** Fallback route name if Next's internal route store is ever missing: guards call this with the request. */
export function noteMeterPath(req: Request) {
  const st = als.getStore()
  if (st && !st.path) { try { st.path = new URL(req.url).pathname } catch { /* ignore */ } }
}

/** Called by handle(): counts the request and gives every read inside it one shared key (for "biggest single request"). */
export function meterRequest<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.READ_METER === '0') return fn()
  return als.run({}, () => { try { meter.request() } catch { /* never break a request */ } return fn() })
}

export const readMeterSnapshot = (): MinuteRow[] => meter.snapshot()
