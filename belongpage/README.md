# Babson Sound site files

Pages: `home.html`, `radio.html`, `events.html`, `leadership-team.html`
Sitewide: `css/babson-sound.css`, `js/babson-sound.js`

## Loading
Campus Groups does not host extra files, and it rewrites `{` and `}` in page content as `%7B` / `%7D`, which breaks any
inline JavaScript. So:
- **CSS:** paste `css/babson-sound.css` into the site's custom CSS (once, sitewide). Do not put CSS in a page body.
- **JS:** each page ends with `<script id="br-site-js">Function(atob("..."))()</script>`, the script as base64 (no braces).
  After editing `js/babson-sound.js` (keep it ASCII only), run `node tools/inline-js.mjs` from this folder to refresh all four
  pages, then re-paste the pages.

## Stray code showing at the bottom of a page
`js/babson-sound.js` must only live inside the four pages (as the base64 loader). If its source ever appears as plain text
below the page, it was also pasted into a Campus Groups settings field that prints raw code (after the closing `</html>`).
Clear that field; the pages already carry the script.

## Page URLs
Campus Groups only serves these custom pages **with a trailing slash**: `/bcr/home/`, `/bcr/radio/`, `/bcr/events/`,
`/bcr/leadership-team/`. Without the slash, `/bcr/radio` and `/bcr/leadership-team` redirect to generic Campus Groups pages
(no nav) and `/bcr/events` lands on the platform's own events list. Join links use `/bcr/club_signup`.

## Nav bar
Each page carries its own fixed nav bar (Home, Radio, Events, Leadership Team, Join), linking to the four URLs above. It steps aside only if a visible Campus Groups header is on the page. Add a "Radio" item to the Campus Groups menu
pointing at the Radio page.

## Dynamic Campus Groups sections
Stats and officers are filled in by Campus Groups. In the files they are empty hidden markers
(`<div class="br-widget-slot" data-widget="...">`) showing where the builder element goes. Keep the builder element
there; the CSS already styles it. Don't paste markup into those slots.
The featured-events block copies the structure from the live page. If it ever shows raw `[CONTENT-...]` text or always
says "There are no upcoming events", treat it as a builder element the same way.

## Radio announcement + password
The Radio page shows "Radio is coming". The player is hidden behind a small "Developer access" link; the password is
`developer`. The home page shows a matching "coming soon" teaser with no player.
This is a soft gate, not real security: the stream address is stored encrypted in `js/babson-sound.js` (it is not in the
page source in plain text), but the password is short, anyone who finds the stream address elsewhere (for example in the
iOS app) can still play it, and the encryption is checkable offline. For true protection the stream itself needs
server-side auth.
- **Change the password or stream address:** `node tools/encrypt-stream.mjs "<stream url>" "<new password>"`, paste the
  printed `var VAULT = ...` line over the existing one in `js/babson-sound.js`, then run `node tools/inline-js.mjs` and re-paste the pages.
- **Launch day:** remove the "coming" section and the gate on `radio.html`, show the player section (`#br-unlocked`) directly,
  and put the player back on the home page.

## Live stream
The stream address (same Asura Icecast mount as the iOS app) lives only in the encrypted `VAULT` in `js/babson-sound.js`. Stream and Web Audio: the visualizer is decorative and does not tap the
stream (cross-origin audio would be muted without CORS headers).

## Radio schedule
Hidden until you add shows. Before the script loads, set:
`window.BR_CONFIG = { schedule: [ { days:[1,2,3,4,5], start:'20:00', end:'22:00', show:'Late Night Vibes', host:'with DJ Name' } ] }`
(days: 0 = Sunday; omit `days` for every day; overnight slots work; times are America/New_York.)

## Colors
Accent is the iOS app's `brGreen` #006644 (fills, buttons). Small text on dark uses a lighter tint of the same green
(#2EC48D) for readability. Dark by default; cream + green on light devices, like the app.
