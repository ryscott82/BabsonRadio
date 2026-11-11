// List-Unsubscribe headers for mail that goes to a list of people (RFC 2369, and RFC 8058 one-click when there is an https link).
// Plain functions (no server imports) so the tests can load them.
//
// Account and security mail (verification, password reset, password set, show decisions) does NOT get these: it is sent because
// the person just asked for it, and a one-click unsubscribe there would only break sign-in.

export function listUnsubscribeHeaders(o: { mailto?: string; url?: string }): Record<string, string> {
  const parts: string[] = []
  if (o.mailto && /^[^\s<>@]+@[^\s<>@]+$/.test(o.mailto)) parts.push(`<mailto:${o.mailto}?subject=unsubscribe>`)
  if (o.url && /^https:\/\/[^\s<>]+$/.test(o.url)) parts.push(`<${o.url}>`)
  if (!parts.length) return {}
  return {
    'List-Unsubscribe': parts.join(', '),
    // One-click needs an https endpoint that accepts the POST; a mailto alone is just the plain header.
    ...(o.url && /^https:\/\//.test(o.url) ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
  }
}
