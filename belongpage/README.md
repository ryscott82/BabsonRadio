# Babson Sound site files

Pages: `home.html`, `events.html`, `leadership-team.html`
Sitewide: `css/babson-sound.css`, `js/babson-sound.js`

The Radio nav tab and the home page "Listen" button link straight to https://babsonradio.com (opens in a new tab).
There is no radio page, player or password gate on Campus Groups anymore.

## Loading
Campus Groups does not host extra files, and it rewrites `{` and `}` in page content as `%7B` / `%7D`, which breaks any
inline JavaScript. So:
- **CSS:** paste `css/babson-sound.css` into the site's custom CSS (once, sitewide). Do not put CSS in a page body.
- **JS:** each page ends with `<script id="br-site-js">Function(atob("..."))()</script>`, the script as base64 (no braces).
  After editing `js/babson-sound.js` (keep it ASCII only), run `node tools/inline-js.mjs` from this folder to refresh all
  pages, then re-paste the pages.

## Stray code showing at the bottom of a page
`js/babson-sound.js` must only live inside the pages (as the base64 loader). If its source ever appears as plain text
below the page, it was also pasted into a Campus Groups settings field that prints raw code (after the closing `</html>`).
Clear that field; the pages already carry the script.

## Page URLs
Campus Groups only serves these custom pages **with a trailing slash**: `/bcr/home/`, `/bcr/events/`,
`/bcr/leadership-team/`. Without the slash, `/bcr/leadership-team` redirects to a generic Campus Groups page
(no nav) and `/bcr/events` lands on the platform's own events list. Join links use `/bcr/club_signup`.

## Nav bar
Each page carries its own fixed nav bar (Home, Radio, Events, Leadership Team, Join). It steps aside only if a visible
Campus Groups header is on the page. Radio goes to babsonradio.com; the other tabs link to the URLs above.

## Request Studio Access
First section under the logo on the home page (`.br-studio`). The "Book a training" button links to the Google Calendar
appointment schedule; change the `href` in `home.html` if the schedule changes.

## Dynamic Campus Groups sections
Stats and officers are filled in by Campus Groups. In the files they are empty hidden markers
(`<div class="br-widget-slot" data-widget="...">`) showing where the builder element goes. Keep the builder element
there; the CSS already styles it. Don't paste markup into those slots.
The featured-events block copies the structure from the live page. If it ever shows raw `[CONTENT-...]` text or always
says "There are no upcoming events", treat it as a builder element the same way.

## Look
Built around the SOUND logo: black, forest green (#173d1c), white, hard offset shadows, taped/torn edges, photocopy grain.
Dark only (no light-mode variant). Titles are lowercase. Font is Normalidad Wide Bold from the radio site's Adobe Fonts kit
(`@import url("https://use.typekit.net/uag7bwr.css")` at the top of the CSS, family `normalidad-wide`).
The logo on the home page is embedded in `home.html` as a transparent WebP data URI. To use a hosted copy, change the `src` of `<img class="br-logo">`.

## Launch countdown
The home page (`.br-count-sec`) carries `data-br-countdown="2026-10-30T10:00:00-04:00"`.
Change that attribute to move the launch (use the -04:00 offset until Nov 1, -05:00 after). When the time passes it
flips to "we're on air" by itself and hides the "Launching" badge.
