// The short summary of the month that the banner (every admin page, and the iOS admin) shows, and the rules for when it shows. Pure, so the tests run it.

import { projectedOver, type Forecast } from './serverUsage.ts'
import { TIER_OF, FEATURE_LABEL, LEVELS, TIERS, type Feature, type Level, type Tier, type TierStatus } from './cpuTiers.ts'

export interface UsageStatus {
  month: string
  allowanceHours: number
  /** The larger of the latest entered reading and our own meter: a warning should lean to the cautious number. */
  hours: number
  pct: number
  source: 'entry' | 'meter'
  entryDate: string | null
  projectedMonthEnd: number
  projectedOver: boolean
  daysUntilExhausted: number | null
  tiers: Record<Tier, { level: Level; locked: boolean }>
  /** The strictest level of any tier. */
  overall: Level
}

export const worstLevel = (ls: Level[]): Level => ls.reduce<Level>((a, l) => (LEVELS.indexOf(l) > LEVELS.indexOf(a) ? l : a), 'normal')

export function statusOf(o: {
  forecast: Pick<Forecast, 'month' | 'allowanceHours' | 'fromEntry' | 'fromMeter'>
  tiers: Record<Tier, Pick<TierStatus, 'level' | 'locked'>>
  dayOfMonth: number
}): UsageStatus {
  const { fromEntry, fromMeter, allowanceHours, month } = o.forecast
  const useEntry = !!fromEntry && fromEntry.hours >= fromMeter.hours
  const main = useEntry ? fromEntry : fromMeter
  const projected = Math.max(fromEntry?.projectedMonthEnd ?? 0, fromMeter.projectedMonthEnd)
  const tiers = Object.fromEntries(TIERS.map(t => [t, { level: o.tiers[t].level, locked: o.tiers[t].locked }])) as UsageStatus['tiers']
  return {
    month, allowanceHours, hours: main.hours, pct: allowanceHours > 0 ? (main.hours / allowanceHours) * 100 : 0,
    source: useEntry ? 'entry' : 'meter', entryDate: fromEntry?.date ?? null,
    projectedMonthEnd: projected, projectedOver: projectedOver(projected, allowanceHours, o.dayOfMonth),
    daysUntilExhausted: (useEntry ? fromEntry : fromMeter).daysUntilExhausted,
    tiers, overall: worstLevel(TIERS.map(t => tiers[t].level)),
  }
}

// ── the banner ──
export type BannerStep = 0 | 50 | 75 | 90 | 100
export const STEPS: BannerStep[] = [50, 75, 90, 100]
export const stepOf = (pct: number): BannerStep => (pct >= 100 ? 100 : pct >= 90 ? 90 : pct >= 75 ? 75 : pct >= 50 ? 50 : 0)

export type BannerTone = 'watch' | 'warn' | 'alert' | 'critical'
export interface Banner {
  /** Higher is more serious. 1 is the forecast alone; 2 to 5 are the 50, 75, 90 and 100% steps. Dismissing hides the banner until the rank goes up. */
  rank: number
  tone: BannerTone
  title: string
  text: string
}

const h = (n: number) => `${Math.round(n * 10) / 10}`
const TONE: Record<BannerStep, BannerTone> = { 0: 'watch', 50: 'watch', 75: 'warn', 90: 'alert', 100: 'critical' }

export function bannerFor(s: UsageStatus | null): Banner | null {
  if (!s) return null
  const step = stepOf(s.pct)
  if (step === 0 && !s.projectedOver) return null
  const left = s.daysUntilExhausted
  const rate = `At this rate the month ends at about ${h(s.projectedMonthEnd)} of ${h(s.allowanceHours)} hours${left !== null && left > 0 && left < 60 ? `, with about ${Math.max(1, Math.round(left))} day${Math.round(left) === 1 ? '' : 's'} left` : ''}.`
  const base = `${h(s.hours)} of ${h(s.allowanceHours)} hours used this month (${Math.round(s.pct)}%).`
  if (step === 0) return { rank: 1, tone: 'watch', title: 'Server time is on track to pass the allowance', text: `${rate} ${base}` }
  const title = step === 100 ? 'Server time has reached the monthly allowance' : `Server time is at ${step}% of the monthly allowance`
  const extra = step === 100 ? 'Vercel may pause the site until the next period.' : s.projectedOver ? rate : ''
  return { rank: 1 + STEPS.indexOf(step) + 1, tone: TONE[step], title, text: [base, extra].filter(Boolean).join(' ') }
}

const KEY = 'usageBannerDismissed'
export const dismissValue = (month: string, rank: number) => `${month}:${rank}`
/** True when the person hid a banner of this rank (or a higher one) this month. A new month, or a higher rank, shows it again. */
export function isDismissed(stored: string | null, month: string, rank: number): boolean {
  if (!stored) return false
  const [m, r] = stored.split(':')
  return m === month && Number(r) >= rank
}
export const DISMISS_KEY = KEY

// ── which features are limited ──
export interface FeatureNow { feature: Feature; label: string; tier: Tier; level: Level; locked: boolean }
export function featuresNow(tiers: Record<Tier, Pick<TierStatus, 'level' | 'locked'>>): FeatureNow[] {
  return (Object.keys(TIER_OF) as Feature[]).map(f => ({ feature: f, label: FEATURE_LABEL[f], tier: TIER_OF[f], level: tiers[TIER_OF[f]].level, locked: tiers[TIER_OF[f]].locked }))
}
/** Plain words for a level: what a listener notices. */
export const LEVEL_WORD: Record<Level, string> = { normal: 'Normal', tight: 'Slowed', critical: 'Off' }

/** The line in Today's "Needs you" when the top banner would show (same status, same rules). Null when there is nothing to warn about. */
export function usageWarning(s: UsageStatus | null): string | null {
  const b = bannerFor(s)
  if (!b || !s) return null
  return b.rank === 1 ? 'Usage warning: server time is on track to pass the allowance' : `Usage warning: server time is at ${Math.round(s.pct)}% of the allowance`
}
