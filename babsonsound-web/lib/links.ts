// Babson Sound links used across the site. iOS mirror: BabsonLinks in BabsonRadio/BrandKit.swift.
export const SITE_URL = 'https://babsonradio.com'
export const CALENDAR_URL = `${SITE_URL}/api/calendar.ics`
export const AUTODJ_CALENDAR_URL = `${SITE_URL}/api/calendar-autodj.ics`

export const LINKS = {
  about: 'https://belong.babson.edu/BCR',
  // Babson College's own privacy policy (also applies to Babson Radio).
  babsonPrivacy: 'https://babson.edu/privacy-policy/',
  events: 'https://belong.babson.edu/bcr/events/',
  // The page the "Join Now" button on our Belong page opens.
  join: 'https://belong.babson.edu/bcr/club_signup',
} as const

// The contact email lives on the server (app/api/contact/route.ts) and is only shown to signed-in people.

/** Instagram handle without the @ (e.g. 'babsonsound'). Leave empty to hide the Instagram links. */
export const INSTAGRAM_HANDLE = 'babson.sound'
export const INSTAGRAM_URL = INSTAGRAM_HANDLE ? `https://www.instagram.com/${INSTAGRAM_HANDLE}/` : ''
