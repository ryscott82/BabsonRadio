// The Resources section on the Members page: tools, and how-to and troubleshooting guides.
// To add a guide: write content/guides/<slug>.md (Markdown: # title, ## headings, lists, **bold**, links) and add one line to GUIDES.
// It appears under Resources and at babsonradio.com/members/guides/<slug>.

export interface Guide { slug: string; title: string; summary: string }

export const GUIDES: Guide[] = [
  { slug: 'gear-policy', title: 'Gear policy', summary: 'How to use the studio gear, what counts as misuse, and what to do when something breaks.' },
  { slug: 'content-requirements', title: 'Content requirements', summary: 'Clean hours, slurs, private information, set lists and what you are responsible for on air.' },
  { slug: 'booth-troubleshooting', title: 'Booth troubleshooting', summary: 'No sound, too loud, echo in your headphones, the booth not answering, and what to do.' },
]

export const guideBySlug = (slug: string) => GUIDES.find(g => g.slug === slug) ?? null

/** The tools listed above the guides. `trained` means only people who have done the training can use it. */
export const TOOLS: { href: string; title: string; summary: string; trained?: boolean }[] = [
  { href: '/words', title: 'Explicit phrase reference', summary: 'Check whether a word or a lyric can go on air.', trained: true },
  { href: '/training', title: 'Training', summary: 'The video, the agreement and the quiz. Retake it here to renew.' },
  { href: '/support', title: 'Support', summary: 'Questions, bugs and anything else for the E-board.' },
]
