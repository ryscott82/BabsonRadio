// Babson Sound links used across the site. iOS mirror: BabsonLinks in BabsonRadio/BrandKit.swift.
export const LINKS = {
  about: 'https://belong.babson.edu/BCR',
  events: 'https://belong.babson.edu/bcr/events/',
  // The page the "Join Now" button on our Belong page opens.
  join: 'https://belong.babson.edu/bcr/club_signup',
} as const

/** Instagram handle without the @ (e.g. 'babsonsound'). Leave empty to hide the Instagram links. */
export const INSTAGRAM_HANDLE = 'babson.sound'
export const INSTAGRAM_URL = INSTAGRAM_HANDLE ? `https://www.instagram.com/${INSTAGRAM_HANDLE}/` : ''
