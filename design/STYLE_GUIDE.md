# Style guide

## Feel
A physical radio on a wooden desk: warm cream paper, deep Babson green, brass details. Controls look
like real hardware (raised, shadowed, they press in). Dark mode is a late-night studio: near-black with
a gold accent.

## Fonts
| Role | Font | Notes |
|---|---|---|
| Display / labels / buttons | Bebas Neue (`font-display`) | Always uppercase feel, wide tracking: `tracking-widest` (labels), `tracking-[0.2em]` (buttons), `tracking-[0.3em–0.4em]` (wordmark) |
| Body | System UI stack | 14px (`text-sm`) default, 12px (`text-xs`) for meta |

Sizes: page title `text-3xl`/`4xl` display; hero headline `text-4xl`–`5xl`.

## Color tokens
Use the Tailwind names in code (`bg-br-dk-surface`); they resolve to CSS variables that change per theme.

| Token (CSS var) | Light | Dark |
|---|---|---|
| Background `--br-bg` | #F5F0E8 | #080808 |
| Surface `--br-surface` | #FDFAF4 | #111111 |
| Surface 2 `--br-surface2` | #EDE8DC | #1A1A1A |
| Border `--br-border` | #D8D0BE | #252525 |
| Border 2 `--br-border2` | #C6BCA6 | #303030 |
| Text `--br-text` | #1A1710 | #E8E8E8 |
| Subtext `--br-sub` | #6A6258 | #888888 |
| Muted `--br-muted` | #A09888 | #444444 |
| Accent `--br-accent` (`br-gold`) | #006644 green | #DDD055 gold |
| Hero panel `--br-hero-a/b` | #FDFAF4 → #EBE4D3 | #0C1A13 → #080808 |

Fixed (same in both themes): Babson green `#006644` (`br-green`), green mid `#007A50`,
brass `#DDD055` (`br-brass`, use on dark-green art blocks), on-air red `#C8302A` (`br-red`).

Rule: on dark-green artwork always use `br-brass`, never `br-gold` (which turns green in light mode).
Category thumbnails: Music green, Interview blue `#1A2E4A→#2E5C8A`, Podcast brown `#2A1A08→#5C3A10`,
Talk purple `#1A0A2E→#4A1A7A`, News red `#2A0808→#7A1A1A`.

## Theme behavior
System preference by default; the sun/moon key in the nav overrides and is remembered
(`localStorage br-theme`, applied by an inline script before paint to avoid a flash).
Override attribute: `<html data-theme="light|dark">`.

## Shape and spacing
Radii: controls `rounded-lg`/`xl`, cards `rounded-xl`/`2xl`, play button full circle. Page width `max-w-6xl`,
side padding `px-4`. Fixed header 64px; content starts at `pt-16`.

## Voice
Sentence case, plain verbs, no apologies in errors. Say what happened and what to do, then the code,
e.g. "Can't reach Babson Radio. Check your connection. (BR-CLI-001)". Codes are listed at `/support/errors`
(`ERROR_CODES.md`). Button text names the action: "Unlock", "Approve", "Sign in".

## Color and layout rules (Oct 2026)
- The site is Babson green only: cream paper in light mode, near-black green in dark mode. Category thumbnails and genre fallbacks are shades of green. Red is only for On Air and errors.
- The one exception is the color-changing background: at night (7pm to 6am) the album colors take over, but only when a host ticks "Color-changing background" for their set (host panel) or an admin ticks it for the auto DJ (/admin/autoschedule). There is no viewer toggle any more.
- Desktop (lg and up) pages fit one screen: wrap the page in `.fit` and put long content in `.fit-body` so it scrolls inside, not the page. Phones scroll normally. The footer is one slim row on desktop.
