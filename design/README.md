# Babson Radio design language

Start here instead of reading code. Files:

- `STYLE_GUIDE.md` — fonts, color tokens (light + dark), spacing, voice
- `COMPONENTS.md` — the skeuomorphic parts (buttons, keys, fields, switches, LED) and how they behave
- `IOS_MAPPING.md` — web token ↔ SwiftUI (`BrandKit.swift`) equivalents

Source of truth in code: `babsonsound-web/app/globals.css` (web), `BabsonRadio/BrandKit.swift` (iOS).
If you change a value there, change it here too.

## Auto-scheduler
Rules and algorithm: `babsonsound-web/lib/autoschedule.ts` (pure logic), runner `lib/server/autoschedule.ts`,
admin page `/admin/autoschedule`, daily cron `/api/cron/autoschedule` (needs `CRON_SECRET`).
