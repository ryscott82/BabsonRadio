import 'server-only'

// Cloudflare Turnstile (free CAPTCHA). Secret in TURNSTILE_SECRET_KEY; the public site key is NEXT_PUBLIC_TURNSTILE_SITE_KEY.
// Returns true/false when Cloudflare answered, and null when it cannot be checked (no secret set, or Cloudflare unreachable).
// Callers treat null as "let them through", so a missing key or an outage never stops people signing up; the hard limits still apply.
export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean | null> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return null
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) })
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return (await res.json()).success === true
  } catch (e) {
    console.error('[turnstile]', e)
    return null
  }
}
