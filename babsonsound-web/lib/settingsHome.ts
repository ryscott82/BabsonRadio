// Where each setting lives now. There is no "all settings" tab: a setting sits on the page it controls, and the rare ones are in that page's Expert fold.
// A search result for a setting, and an old /admin/settings?focus=<key> link, open the page below with that row highlighted.

export function settingPage(key: string): string {
  if (key.startsWith('limits.')) return '/admin/listening-limits'
  if (key.startsWith('slots.')) return '/admin/slots'
  if (key.startsWith('cpu.')) return '/admin/server-load'
  return '/admin/expert' // Auto DJ machinery: its rules and playlists are on the Auto DJ page, the rest is Expert
}

export const settingHref = (key: string) => `${settingPage(key)}?focus=${encodeURIComponent(key)}`

/** The old /admin/settings address: a setting link goes to that setting's page, a bare link goes to the Advanced tab of the menu. */
export const oldSettingsTarget = (focus: string | null) => (focus ? settingHref(focus) : '/admin#advanced')
