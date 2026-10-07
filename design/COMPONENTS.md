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
