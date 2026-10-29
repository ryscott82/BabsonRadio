import { createHash } from 'node:crypto'
import { THEME_SCRIPT } from './themeScript.ts'

// Security headers for every response (applied in next.config.ts). Plain function so the tests can check it.
//
// The CSP ships as Content-Security-Policy-Report-Only first: browsers log what it WOULD have blocked in the console and block
// nothing. Open the site, click around, read the console, then add anything legitimate here before switching to enforcing.
// Next.js puts small inline scripts in every page (the data it hydrates with). Those are not allowed by a hash-only policy, so
// expect them in the report; enforcing needs per-request nonces (which makes pages dynamic) or 'unsafe-inline'. See SECURITY_SETUP.md.

const host = (u: string | undefined) => { try { return u ? new URL(u).origin : '' } catch { return '' } }

export function securityHeaders(env: Record<string, string | undefined> = process.env) {
  const themeHash = `'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`
  // The stream and the cover pictures come from the station's AzuraCast server (Asura Hosting).
  const station = [...new Set([host(env.NEXT_PUBLIC_STREAM_URL), host(env.AZURACAST_URL), 'https://a12.asurahosting.com'].filter(Boolean))]
  const csp = [
    `default-src 'self'`,
    // Our own scripts, the theme script above, Turnstile, YouTube's player API, Firebase's auth helper.
    `script-src 'self' ${themeHash} https://challenges.cloudflare.com https://www.youtube.com https://s.ytimg.com https://apis.google.com`,
    // Inline style attributes and Next's style tags are used throughout; Typekit stylesheets.
    `style-src 'self' 'unsafe-inline' https://use.typekit.net https://p.typekit.net`,
    `font-src 'self' data: https://use.typekit.net https://p.typekit.net`,
    `img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://img.youtube.com https://i.ytimg.com ${station.join(' ')}`,
    `media-src 'self' blob: ${station.join(' ')} https://firebasestorage.googleapis.com https://storage.googleapis.com`,
    // Firebase (sign-in, Firestore, App Check/installations), Turnstile, and the stream (probed for CORS before the equalizer attaches).
    `connect-src 'self' ${station.join(' ')} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://challenges.cloudflare.com`,
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com https://*.firebaseapp.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')

  return [
    { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
    { key: 'Content-Security-Policy-Report-Only', value: csp },
  ]
}
