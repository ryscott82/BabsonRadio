export const fmtH = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 2026-11-08 -> "Nov 8" */
export const fmtDay = (d: string) => `${MON[Number(d.slice(5, 7)) - 1] ?? ''} ${Number(d.slice(8, 10))}`
/** 2026-11 -> "November 2026" */
export const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const fmtWhen = (ms: number) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
export const todayLocal = () => new Date().toLocaleDateString('en-CA')
