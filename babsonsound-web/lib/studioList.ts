// The E-board guest list as CSV. Pure, so the tests cover the escaping.
export interface ListRow { kind: 'studio' | 'live' | 'prerecorded'; startAt: number; endAt: number; hostName: string; hostEmail: string; title: string; status: string; guests: { name: string; email: string }[]; justMe: boolean }

/** One CSV cell: quoted, and a leading = + - @ is defused so a spreadsheet never runs it as a formula. */
export const csvCell = (v: unknown) => {
  let s = String(v ?? '').replace(/[\r\n]+/g, ' ')
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

export function guestCsv(rows: ListRow[]): string {
  const head = ['Type', 'When (ET)', 'Host', 'Host email', 'Title', 'Status', 'Guest name', 'Guest email']
  const lines = [head.map(csvCell).join(',')]
  for (const r of rows) {
    const base = [r.kind, when(r.startAt), r.hostName, r.hostEmail, r.title, r.status]
    if (!r.guests.length) lines.push([...base, r.justMe ? '(just me)' : '', ''].map(csvCell).join(','))
    for (const g of r.guests) lines.push([...base, g.name, g.email].map(csvCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
