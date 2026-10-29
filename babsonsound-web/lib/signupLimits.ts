// Sign-up limits. One person makes one account, so these can be strict, but a whole campus may share one public IP
// (Babson Wi-Fi, launch day). So an IP alone is never blocked early: the first response is a quick CAPTCHA check, and a hard
// block (429) comes only at clearly abusive levels. Plain functions so the tests can run them.

export const WINDOW_MS = 10 * 60_000
export const LIMITS = {
  ipCaptchaInWindow: 3,    // 3 sign-up attempts from one IP in 10 minutes: ask for the check
  ipBlockInWindow: 40,     // 40 in 10 minutes: block
  ipBlockPerDay: 300,      // 300 in a day from one IP: block
  failCaptchaInWindow: 4,  // repeated failures (bad input slipping through, email taken...) in 10 minutes: check
  failBlockInWindow: 25,
  domainCaptchaPerHour: 40,        // other mail domains (gmail.com...) in one hour
  domainBlockPerHour: 400,
  schoolDomainCaptchaPerHour: 300, // babson.edu, olin.edu, wellesley.edu: launch day is busy
  schoolDomainBlockPerHour: 3000,
  globalCaptchaPerMinute: 30,      // the whole site in one minute
  globalBlockPerMinute: 300,
} as const

export type IpCounts = { recent: number[]; fails: number[]; day: number }
export type Decision = { action: 'ok' | 'captcha' | 'block'; reason: string }

export function decideSignup(i: { now: number; ip: IpCounts | null; school: boolean; domainThisHour: number; globalThisMinute: number }): Decision {
  const L = LIMITS
  const inWin = (xs: number[]) => xs.filter(t => i.now - t < WINDOW_MS).length
  const recent = i.ip ? inWin(i.ip.recent) : 0
  const fails = i.ip ? inWin(i.ip.fails) : 0
  const dayCount = i.ip?.day ?? 0
  const domBlock = i.school ? L.schoolDomainBlockPerHour : L.domainBlockPerHour
  const domCaptcha = i.school ? L.schoolDomainCaptchaPerHour : L.domainCaptchaPerHour

  if (recent >= L.ipBlockInWindow) return { action: 'block', reason: 'ip burst' }
  if (dayCount >= L.ipBlockPerDay) return { action: 'block', reason: 'ip day' }
  if (fails >= L.failBlockInWindow) return { action: 'block', reason: 'ip failures' }
  if (i.domainThisHour >= domBlock) return { action: 'block', reason: 'domain flood' }
  if (i.globalThisMinute >= L.globalBlockPerMinute) return { action: 'block', reason: 'site flood' }

  if (recent >= L.ipCaptchaInWindow) return { action: 'captcha', reason: 'several from this IP' }
  if (fails >= L.failCaptchaInWindow) return { action: 'captcha', reason: 'repeated failures' }
  if (i.domainThisHour >= domCaptcha) return { action: 'captcha', reason: 'busy domain' }
  if (i.globalThisMinute >= L.globalCaptchaPerMinute) return { action: 'captcha', reason: 'busy site' }
  return { action: 'ok', reason: '' }
}

/** The caller's IP on Vercel: x-real-ip, else the first x-forwarded-for entry. Empty when unknown (local dev). */
export function clientIp(h: { get(name: string): string | null }): string {
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
}

/** Keeps only the newest `max` times. */
export const newest = (xs: number[], max = 20) => xs.slice(-max)

export const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase()
