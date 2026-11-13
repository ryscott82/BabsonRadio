// Numbers for the Server load page: chart series, the feature cost table and the "what if" box. Pure, so the tests run it.

import { daysInMonth, monthOfDate, withCpu, type UsageEntry } from './serverUsage.ts'
import type { Tier } from './cpuTiers.ts'

// ── chart: Active CPU hours through a month ──
export interface Pt { day: number; hours: number }

/** Entered readings for one month, one point a day (the last one entered wins), in day order. */
export function enteredSeries(month: string, entries: Pick<UsageEntry, 'date' | 'activeCpuHours' | 'enteredAt'>[]): Pt[] {
  const byDay = new Map<number, { activeCpuHours: number; enteredAt: number }>()
  for (const e of withCpu(entries)) {
    if (monthOfDate(e.date) !== month) continue
    const day = Number(e.date.slice(8, 10))
    const cur = byDay.get(day)
    if (!cur || e.enteredAt >= cur.enteredAt) byDay.set(day, e)
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, e]) => ({ day, hours: e.activeCpuHours }))
}

/** Our own meter, adding up through the month. `perDay` is hours used on each day ('1' to '31'); `offset` is the hours typed in as already counted by Vercel. */
export function meterSeries(month: string, perDay: Record<string, number>, offset = 0, lastDay = daysInMonth(month)): Pt[] {
  const out: Pt[] = []
  let sum = offset
  for (let d = 1; d <= lastDay; d++) { sum += Number(perDay[String(d)] ?? 0); out.push({ day: d, hours: Math.round(sum * 1000) / 1000 }) }
  return out
}

/** The meter's running total at the end of a day, for the history table. */
export function meterAt(date: string, perDay: Record<string, number> | undefined, offset = 0): number | null {
  if (!perDay || !Object.keys(perDay).length) return null
  const day = Number(date.slice(8, 10))
  let sum = offset
  for (let d = 1; d <= day; d++) sum += Number(perDay[String(d)] ?? 0)
  return Math.round(sum * 1000) / 1000
}

/** A top for an axis that is easy to read: 1, 2, 2.5, 5 or 10 times a power of ten, with room for the allowance line. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}
export function ticks(max: number, n = 4): number[] { return Array.from({ length: n + 1 }, (_, i) => Math.round(((max * i) / n) * 1000) / 1000) }

/** Months that have an entry, newest first, with the current month always offered. */
export function monthsOf(entries: Pick<UsageEntry, 'date'>[], current: string): string[] {
  return [...new Set([current, ...entries.map(e => monthOfDate(e.date))])].sort().reverse()
}

// ── what each feature costs ──
// From the backend report (CPU plan v2). "Per listener" calls grow with the number of listeners; "shared" calls run once per cache window for the
// whole site whoever is listening, so they do not.
export interface FeatureCost {
  id: string; name: string; routes: string[]; tier: Tier | 0
  kind: 'per-listener' | 'shared'
  /** per-listener: calls each listener makes in an hour. shared: the most calls the whole site makes in an hour. */
  callsPerHour: number
  note: string
}
export const FEATURE_COSTS: FeatureCost[] = [
  { id: 'listen', name: 'Starting to listen and check-ins', routes: ['/api/listen'], tier: 2, kind: 'per-listener', callsPerHour: 6, note: 'One call at play, then one every 12 minutes while playing.' },
  { id: 'taps', name: 'Skip, vote, star and set list taps', routes: ['/api/skip', '/api/vote', '/api/live/rating', '/api/live/setlist'], tier: 2, kind: 'per-listener', callsPerHour: 1, note: 'Only when someone taps. About one an hour is a guess.' },
  { id: 'reactions', name: 'Live reactions', routes: ['/api/live/reactions'], tier: 3, kind: 'shared', callsPerHour: 1800, note: 'At most one run every 2 seconds while reactions are flowing, every 6 when quiet.' },
  { id: 'nowplaying', name: 'Now playing', routes: ['/api/nowplaying'], tier: 0, kind: 'shared', callsPerHour: 450, note: 'At most one run every 8 seconds while anyone has a page open.' },
  { id: 'bundle', name: 'Shared live page data', routes: ['/api/live/bundle'], tier: 0, kind: 'shared', callsPerHour: 60, note: 'At most one run a minute.' },
  { id: 'schedule', name: 'Schedule (signed out)', routes: ['/api/schedule'], tier: 0, kind: 'shared', callsPerHour: 12, note: 'One run every 5 minutes.' },
]

export interface RouteCpu { route: string; requests: number; cpuMs: number; avgCpuMs: number }

export interface FeatureRow extends FeatureCost { avgMs: number | null; secondsPerHour: number | null }
/**
 * Adds our meter's average server time per call (this server instance, last hour) to each feature.
 * secondsPerHour: per-listener features give seconds per listener-hour, shared ones give seconds per hour for the whole site.
 */
export function featureRows(routes: RouteCpu[] | null | undefined): FeatureRow[] {
  return FEATURE_COSTS.map(f => {
    const hit = (routes ?? []).filter(r => f.routes.some(p => r.route === p || r.route.startsWith(`${p} `) || r.route.startsWith(`${p}?`)) && r.requests > 0)
    const calls = hit.reduce((a, r) => a + r.requests, 0)
    const avg = calls > 0 ? hit.reduce((a, r) => a + r.cpuMs, 0) / calls : null
    return { ...f, avgMs: avg, secondsPerHour: avg === null ? null : (f.callsPerHour * avg) / 1000 }
  })
}

// ── what if ──
export interface WhatIf { cpuHours: number; pctOfAllowance: number; afterThisHours: number | null; fits: boolean | null }
/**
 * Listeners x hours -> expected server hours, from the measured cost (CPU seconds per listener-hour, which already includes the shared work
 * spread over the listeners we had). `usedHours` is what the month has used so far, if known.
 */
export function whatIf(o: { listeners: number; hours: number; secondsPerListenerHour: number; allowanceHours: number; usedHours?: number | null }): WhatIf | null {
  const { listeners, hours, secondsPerListenerHour, allowanceHours } = o
  if (![listeners, hours, secondsPerListenerHour].every(n => Number.isFinite(n) && n >= 0)) return null
  const cpuHours = (listeners * hours * secondsPerListenerHour) / 3600
  const after = o.usedHours == null ? null : o.usedHours + cpuHours
  return { cpuHours, pctOfAllowance: allowanceHours > 0 ? (cpuHours / allowanceHours) * 100 : 0, afterThisHours: after, fits: after == null ? null : after <= allowanceHours }
}
