// The Studio training form address. Pure rules (no server imports) so the API, the admin page and the tests share them.
// It must be an https link to Microsoft Forms. "embed=true" is added so the form fits in the frame on /studioaccess.

export const FORM_HOSTS = ['forms.office.com', 'forms.cloud.microsoft', 'forms.microsoft.com']

/** The cleaned, embeddable address, or null when the text is not an https Microsoft Forms link. */
export function cleanFormUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' || !FORM_HOSTS.includes(u.hostname) || u.username || u.password) return null
    if (!u.searchParams.has('embed')) u.searchParams.set('embed', 'true')
    return u.toString()
  } catch { return null }
}

/** The address to hand out: with "embed=true" when the form is shown inside the page, without it when the form opens in its own window. */
export function formUrlFor(url: string, embed: boolean): string {
  const u = new URL(url)
  if (embed) u.searchParams.set('embed', 'true'); else u.searchParams.delete('embed')
  return u.toString()
}
