import { DEFAULT_CONFIG } from './autoschedule.ts'
import { DEFAULT_DIRECT_AT, DEFAULT_THRESHOLDS } from './cpuTiers.ts'
import { DEFAULT_AUDIENCE, DEFAULT_LIMITS } from './listenLimits.ts'
import type { SettingDef, SettingTier } from './settingRow.ts'

// Every setting on Admin > Settings: its words, range, default and which tier it lives in. Where it is read and saved is in
// components/admin/settings/sources.ts. Defaults come from the same constants the server uses, except the server-time defaults marked below.

export const TIER_INFO: Record<SettingTier, { title: string; text: string }> = {
  everyday: { title: 'Everyday', text: 'Switches you may flip on a normal week.' },
  customize: { title: 'Customize', text: 'How the station behaves. Change when listeners or hosts ask for it.' },
  defaults: { title: 'Defaults and safety', text: 'Set once and mostly leave. A wrong value here can affect every listener.' },
}

const WHO = { student: 'Students', guest: 'Guests' } as const
const LISTENERS = 'every listener on the site and in the app'

const audienceDefs = (a: 'student' | 'guest'): SettingDef[] => {
  const w = WHO[a], g = `Listening limits: ${w.toLowerCase()}`, d = DEFAULT_AUDIENCE
  return [
    { id: `limits.${a}.quietEnabled`, tier: 'everyday', level: 3, group: g, kind: 'boolean', default: d.quietEnabled,
      label: `${w}: pause playlists overnight (sleep)`, help: 'Playlists stop for sleep hours. Live shows still play.',
      affects: `${w.toLowerCase()} listening overnight`, risk: 'Turning it off lets playlists run all night.', keywords: 'sleep quiet night' },
    { id: `limits.${a}.idleMin`, tier: 'customize', level: 2, group: g, kind: 'number', default: d.idleMin, min: 0, max: 1440, unit: 'minutes',
      label: `${w}: ask “still listening?” after`, help: 'Minutes with no tap or key press. 0 means never ask.', keywords: 'idle inactive' },
    { id: `limits.${a}.sessionMaxMin`, tier: 'customize', level: 2, group: g, kind: 'number', default: d.sessionMaxMin, min: 0, max: 10080, unit: 'minutes',
      label: `${w}: stop listening after`, help: 'Minutes in a row before the player stops. 0 means no limit.', keywords: 'session maximum' },
    { id: `limits.${a}.quietStart`, tier: 'customize', level: 2, group: g, kind: 'hour', default: d.quietStart,
      label: `${w}: sleep starts`, help: 'Station time. Only used while sleep hours are on.', keywords: 'quiet night' },
    { id: `limits.${a}.quietEnd`, tier: 'customize', level: 2, group: g, kind: 'hour', default: d.quietEnd,
      label: `${w}: sleep ends`, help: 'Station time. Only used while sleep hours are on.', keywords: 'quiet night' },
    { id: `limits.${a}.dailyCapMin`, tier: 'defaults', level: 3, group: g, kind: 'number', default: d.dailyCapMin, min: 0, max: 1440, unit: 'minutes',
      label: `${w}: daily listening limit`, help: 'Not enforced right now: the server no longer counts listening minutes, to save server time. 0 means no limit.',
      affects: w.toLowerCase(), risk: 'It has no effect today, but it will apply if counting is turned back on.', keywords: 'daily cap' },
    { id: `limits.${a}.dailyAutoMin`, tier: 'defaults', level: 3, group: g, kind: 'number', default: d.dailyAutoMin, min: 0, max: 1440, unit: 'minutes',
      label: `${w}: daily playlist limit`, help: 'Not enforced right now, same reason. 0 means no limit.',
      affects: w.toLowerCase(), risk: 'It has no effect today, but it will apply if counting is turned back on.', keywords: 'daily cap playlist' },
  ]
}

const auto = 'Auto DJ'
export const SETTINGS: SettingDef[] = [
  // ── Everyday ──
  { id: 'auto.enabled', tier: 'everyday', level: 3, group: auto, kind: 'boolean', default: DEFAULT_CONFIG.enabled,
    label: 'Auto DJ is on', help: 'Fills the gaps between shows with playlists. Off means nothing is planned for the gaps.',
    affects: LISTENERS, risk: 'Gaps between shows can go quiet.', keywords: 'autoschedule filler playlists' },
  ...audienceDefs('student').filter(s => s.tier === 'everyday'),
  ...audienceDefs('guest').filter(s => s.tier === 'everyday'),

  // ── Customize ──
  ...audienceDefs('student').filter(s => s.tier === 'customize'),
  ...audienceDefs('guest').filter(s => s.tier === 'customize'),
  { id: 'auto.learn', tier: 'customize', level: 2, group: auto, kind: 'boolean', default: DEFAULT_CONFIG.learn,
    label: 'Auto DJ favors what listeners like', help: 'Leans toward genres with more listeners, ratings and reactions. Every genre still gets airtime.' },
  { id: 'auto.colorChanging', tier: 'customize', level: 2, group: auto, kind: 'boolean', default: DEFAULT_CONFIG.colorChanging,
    label: 'Night-time color-changing background', help: 'The site background follows the album colors while Auto DJ is on air.', keywords: 'album color theme' },
  { id: 'auto.horizonHours', tier: 'customize', level: 2, group: auto, kind: 'number', default: DEFAULT_CONFIG.horizonHours, min: 6, max: 168, unit: 'hours',
    label: 'Plan Auto DJ this far ahead', help: 'How many hours ahead the gaps are filled.' },

  // ── Defaults and safety ──
  ...audienceDefs('student').filter(s => s.tier === 'defaults'),
  ...audienceDefs('guest').filter(s => s.tier === 'defaults'),
  { id: 'limits.refreshSec', tier: 'defaults', level: 3, group: 'Listening limits: check-ins', kind: 'number', default: DEFAULT_LIMITS.refreshSec, min: 120, max: 3600, unit: 'seconds',
    label: 'Seconds between listening check-ins', help: 'How often an open player tells the server it is still there. Longer uses less server time.',
    affects: LISTENERS, risk: 'Too short uses up server time faster. Too long makes the listener count lag.', keywords: 'refresh seconds server time' },
  { id: 'limits.budgetEnabled', tier: 'defaults', level: 3, group: 'Listening limits: check-ins', kind: 'boolean', default: DEFAULT_LIMITS.budgetEnabled,
    label: 'Use the monthly listening hours limit', help: 'Off, because the hosting plan has no hour limit. When on, limits get stricter as the month’s listening hours fill up.',
    affects: LISTENERS, risk: 'Turning it on can cut listening short late in the month.', keywords: 'budget hours' },
  { id: 'auto.stepMinutes', tier: 'defaults', level: 2, group: auto, kind: 'choice', default: String(DEFAULT_CONFIG.stepMinutes),
    choices: [{ value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '60 minutes' }],
    label: 'Auto DJ planning grid', help: 'The smallest slice of time Auto DJ plans.' },
  { id: 'auto.maxBlockMinutes', tier: 'defaults', level: 2, group: auto, kind: 'number', default: DEFAULT_CONFIG.maxBlockMinutes, min: 30, max: 360, unit: 'minutes',
    label: 'Longest single Auto DJ block', help: 'A playlist block never runs longer than this, unless a rule sets its own length.' },
  { id: 'auto.lockMinutes', tier: 'defaults', level: 3, group: auto, kind: 'number', default: DEFAULT_CONFIG.lockMinutes, min: 0, max: 360, unit: 'minutes',
    label: 'Leave Auto DJ blocks alone when they start within', help: 'Blocks starting sooner than this are not changed when the plan is rebuilt, so what is playing never flips.',
    affects: LISTENERS, risk: 'Too small lets the playlist change right under a listener.' },
  { id: 'auto.syncToAzuraCast', tier: 'defaults', level: 3, group: auto, kind: 'boolean', default: DEFAULT_CONFIG.syncToAzuraCast,
    label: 'Send the plan to the radio server', help: 'After every rebuild, the plan is written to the playlists on the radio server (AzuraCast).',
    affects: LISTENERS, risk: 'On changes what actually plays, not just what the schedule shows.', keywords: 'azuracast sync' },
  { id: 'cpu.budgetHours', tier: 'defaults', level: 3, group: 'Server time', kind: 'number', default: 4, min: 0.1, max: 10000, unit: 'hours',
    label: 'Monthly server time allowance', help: 'Vercel’s Active CPU hours for the month. The meter and the tiers use this number.',
    affects: LISTENERS, risk: 'A number higher than the real allowance delays slowing the site down, and the site can be paused.', keywords: 'vercel cpu budget' },
  { id: 'cpu.auto', tier: 'defaults', level: 3, group: 'Server time', kind: 'boolean', default: true,
    label: 'Slow features down automatically', help: 'When the month fills up, reactions, ratings and other extras slow down or turn off by themselves.',
    affects: LISTENERS, risk: 'Off means nothing slows down until you do it by hand, and the site can be paused.', keywords: 'vercel cpu tiers' },
  { id: 'cpu.nowPlayingDirect', tier: 'defaults', level: 3, group: 'Server time', kind: 'choice', default: 'auto',
    choices: [{ value: 'auto', label: 'Automatic' }, { value: 'on', label: 'Always on' }, { value: 'off', label: 'Off' }],
    label: 'Read “now playing” straight from the radio server', help: 'Pages read the radio server’s public feed instead of asking our server. Saves server time.',
    affects: LISTENERS, risk: 'If the feed is down, now playing can go stale.', keywords: 'direct feed' },
  { id: 'cpu.directAt', tier: 'defaults', level: 3, group: 'Server time', kind: 'number', default: DEFAULT_DIRECT_AT, scale: 100, min: 0.1, max: 2, unit: '%',
    label: 'Switch to the direct feed at', help: 'Share of the monthly allowance where Automatic starts reading now playing straight from the radio server.',
    affects: LISTENERS, keywords: 'direct feed threshold' },
  ...([3, 2, 1] as const).flatMap(t => (['tight', 'critical'] as const).map<SettingDef>(step => ({
    id: `cpu.th.${t}.${step}`, tier: 'defaults', level: 3, group: 'Server time', kind: 'number', default: DEFAULT_THRESHOLDS[t][step], scale: 100, min: 0.01, max: 10, unit: '%',
    label: `Tier ${t}: ${step === 'tight' ? 'slow down' : 'turn off'} at`,
    help: `Share of the monthly allowance (used, or on track to use) where tier ${t} ${step === 'tight' ? 'is slowed' : 'is turned off'}. Above 100% means never by itself.`,
    affects: LISTENERS, risk: 'Set too high and the site can run out of server time and be paused.', keywords: 'vercel cpu threshold level',
  }))),
]

export const byId = (id: string) => SETTINGS.find(s => s.id === id)
export const inTier = (tier: SettingTier) => SETTINGS.filter(s => s.tier === tier)
