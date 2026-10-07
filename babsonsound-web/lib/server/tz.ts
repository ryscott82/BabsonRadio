import 'server-only'

/** Station-local calendar date + minutes since midnight to UTC ms (DST-safe). */
export function localToUtc(y: number, m: number, d: number, minutes: number, tz: string): number {
  const asUtc = Date.UTC(y, m - 1, d, 0, minutes)
  let utc = asUtc
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(utc))
    const g = (t: string) => Number(p.find(x => x.type === t)?.value)
    const shown = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    utc += asUtc - shown
  }
  return utc
}

/** [year, month, day] of a timestamp in the station's time zone. */
export function localDate(ms: number, tz: string): [number, number, number] {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms)).split('-').map(Number)
  return [y, m, d]
}
