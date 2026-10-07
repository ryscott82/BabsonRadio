# Web ↔ iOS

The iOS palette lives in `BabsonRadio/BrandKit.swift` (cream backgrounds, Babson green, gold accent,
`brActiveAccent`). The web light theme was derived from it, so the same names apply:

| Web token | iOS |
|---|---|
| `--br-bg` / surface / text | BrandKit background / card / primary text colors |
| `--br-accent` | `brActiveAccent` (green in light, gold in dark) |
| `br-brass` | brass/gold used on green artwork |
| `.sk-btn` | Primary button style: gradient + bottom edge, press offset |

Verify exact hex values in `BrandKit.swift` before changing either side; keep both in sync.
