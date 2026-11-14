// The Explicit phrase reference (babsonradio.com/words, and the button on the studio booth): type a word or phrase, see what the
// station's word list says about airing it. Pure wording, shared by the page, the booth and the tests. Never shows the list itself.

export type PhraseTier = 'clean' | 'crude' | 'explicit' | 'banned'
export type PhraseTone = 'ok' | 'caution' | 'no'

export const PHRASE_MAX = 200

/** What a result means for going on air, in the words the agreement uses. */
export function phraseVerdict(tier: PhraseTier): { title: string; text: string; tone: PhraseTone } {
  if (tier === 'banned') return { title: 'Slur. Never allowed.', text: 'Not on air at any hour, live or pre-recorded, in a song, a clip or a quote, bleeped or not.', tone: 'no' }
  if (tier === 'explicit') return { title: 'Explicit.', text: 'Not on air from 6 AM to 10 PM Eastern. After 10 PM it is up to you and the show rules.', tone: 'caution' }
  if (tier === 'crude') return { title: 'Crude.', text: 'Counts as profanity: keep it off the air from 6 AM to 10 PM Eastern.', tone: 'caution' }
  return { title: 'Not on the list.', text: 'That does not make it fine. If you are not sure, leave it out and ask the E-board.', tone: 'ok' }
}
