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

# iOS hardware port (Oct 2026, branch `ios-overhaul`)

The iOS app now uses the same hardware look as the website. Mock geometry is in points on a 390 x 844 phone canvas and scales with `k = min(w/390, h/844)`.

| Web | iOS file / type |
|---|---|
| `.hw-stage` oak desk | `Hardware.swift` `HWDesk(album:)` (light / dark / album-hued oak) |
| `.hw-panel` leather card | `HWLeather`, `.hwPanel()` |
| `.hw-key` steel key | `HWKeyStyle` (`.buttonStyle(.hwKey)`), `HWKey`, `HWRoundKeyStyle` |
| `.hw-knob` | `HWKnob`, `HWDial` (volume) |
| `.hw-eq` / `.hw-well` | `HWEQ`, `HWEQWell` (LED bars, real spectrum when the stream allows) |
| `.hw-sign` ON AIR | `HWOnAirSign`, `HWOnAirLamp` (live shows only, plus the admin manual switch) |
| `.hw-cover` + `.hw-vinyl` | `DeskSleeve`, `DeskRecord` |
| `.sk-field` | `HWFieldFill`, `Color.hwField(_:)` |
| stars | `HWStar` |
| tab bar | `HWNav.swift` `HWTabBar` (phone, 83 pt) and `HWSideBar` (Duo / iPad, floating vertical) |

Layouts
- Phone live: `LiveDesk.swift` `PhoneLiveDesk` (record, sleeve, leather panel with title / EQ / dial / keys, bottom drawer `HWDrawerSheet`).
- Duo / iPad: `DuoDesk.swift` `DuoLeftPage` + `DuoRightPage` (two 391 pt pages with an 18 pt hinge, `onHingeChange` on iOS 27.1).
- Full screen: `BoardViews.swift` `LiveBoardView` (sideways phone 844 x 390, stacked 1248 x 844). Cover, title, reaction keys and a QR code to react from a phone. No EQ or record. Transport fades after 4 s.
- Type: Barlow Condensed for titles (`BRFont.display`), Barlow for everything else (`BRFont.body`). Fonts are in `BabsonRadio/Fonts`, listed in `Info.plist` under UIAppFonts.
- Textures are image sets named `hw_*` in `Assets.xcassets`.
