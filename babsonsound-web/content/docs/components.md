# Skeuomorphic components (defined in `app/globals.css`)

Light source is top-left; shadows are warm brown (`--sk-rgb`) in light mode.

| Class | Looks like | Behavior |
|---|---|---|
| `.sk-raised` | Raised card/plate: soft gradient face, highlight edge, drop shadow | Static. Use for cards, menus, list groups |
| `.sk-hero` | Large recessed-glow hero panel (uses `--br-hero-a/b`) | Static; add `grain` for paper texture |
| `.sk-btn` | Primary hardware button: gradient face (green light / gold dark), 3px solid edge below | Hover brightens; `:active` or `aria-pressed="true"` moves down 3px, edge collapses, inset shadow |
| `.sk-key` | Secondary key: cream face, thin edge | Same press behavior; use `aria-pressed` for toggled-on look |
| `.sk-field` | Recessed text input | Inner shadow; accent focus ring |
| `.sk-switch` + `.sk-knob` | Slide switch, recessed track + raised knob | Track fills with accent when `aria-checked="true"` |
| `.sk-led` | Indicator lamp | `data-on="true"` glows green |

Guidelines
- One `.sk-btn` per view for the main action; everything else `.sk-key` or text.
- The play button is a round `.sk-btn` with `aria-pressed={isPlaying}`, so it stays pushed in while playing.
- Respect reduced motion (transitions are disabled in the media query at the end of the file).
- Don't stack shadows: put `.sk-raised` on the outer card only.

# Hardware look (Oct 2026, `app/hardware.css`)
Used on the home/live page. Mockups: the Babson Radio design canvas (Web*, Duo*, Ios* boards). Textures: `public/hw/`.

| Class | What it is |
|---|---|
| `.hw-stage` | Page wrapper: oak desk behind the page (`body:has(.hw-stage)`), light and dark oak |
| `.hw-panel` (+ `.hw-tight` / `.hw-snug`) | Leather card. Light: green leather rim, stitching, ivory ceramic face, black glass corner caps. Dark: black leather, stitching, steel screws. `.sk-key`, `.sk-field` inside it become steel keys / recessed slots |
| `.hw-cover` `.hw-cover-art` `.hw-vinyl` `.hw-sign` | Cover on the desk (tilted), record peeking out, ON AIR sign on the corner (live shows only) |
| `.hw-title` `.hw-sub` | Barlow Condensed title (one line, ellipsis), Barlow secondary text |
| `.hw-prog` `.hw-well` `.hw-eq` | Progress slot, recessed equalizer well, animated bars (static when paused) |
| `.sk-btn.hw-knob` | Steel play knob, pushed in while playing |
| `.hw-key`, `.hw-keys` | Steel key; `aria-pressed="true"` = pushed in |

Not done yet on web: album-art mode hue-shift of leather/wood, per-corner random cap wear, grainy stars, volume knob, schedule card on the live page.
Listeners cannot send feedback to hosts: the end-of-show comment box was removed from `LiveExtras.tsx`; stars remain.

# iOS hardware components (Oct 2026)
See `IOS_MAPPING.md` for the full table. Rules that apply to every screen:
- Backgrounds are `HWDesk()`; cards are `.brCard()` (black leather in dark, ceramic in light); inputs use `HWFieldFill()`.
- Buttons use `HWKeyStyle`. One lit (pushed in) key per view at most.
- No glows or pulsing dots. ON AIR only for live shows.
- Album-art mode: `HWMode.album(color)` tints desk and leather from the cover hue. Neutral covers go graphite.
