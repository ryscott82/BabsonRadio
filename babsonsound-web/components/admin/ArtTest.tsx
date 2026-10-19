'use client'

import { useEffect, useState } from 'react'
import { getArtTest, onPartyChange, setArtTest } from '@/lib/party'
import { ART_PRESETS } from '@/components/ArtTheme'

// Admin-only preview of the album-color look on the home page. Applies to this browser only (nothing is saved to the station).
export default function ArtTest() {
  const [t, setT] = useState({ on: false, preset: '' })
  useEffect(() => { const sync = () => setT(getArtTest()); sync(); return onPartyChange(sync) }, [])
  const pick = (preset: string) => setArtTest({ on: true, preset })
  return (
    <section className="sk-raised p-4 space-y-3">
      <h2 className="text-br-gold text-xs">album-color preview</h2>
      <p className="text-sm text-br-dk-sub">Shows the home page the way it looks at night with color-changing on. Only in this browser; listeners are not affected.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={t.on && !t.preset} onClick={() => pick('')} className="sk-key text-sm px-3 py-1.5 rounded-lg">Current cover</button>
        {Object.entries(ART_PRESETS).map(([id, p]) => (
          <button key={id} type="button" aria-pressed={t.on && t.preset === id} onClick={() => pick(id)} className="sk-key text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-2">
            <span aria-hidden className="inline-block w-3 h-3 rounded-full" style={{ background: p.colors[0] }} />{p.label}
          </button>
        ))}
        <button type="button" onClick={() => setArtTest({ on: false, preset: '' })} disabled={!t.on} className="sk-key text-sm px-3 py-1.5 rounded-lg">Off</button>
      </div>
      {t.on && <p className="text-xs text-br-dk-sub">Preview is on. Open the home page to see it.</p>}
    </section>
  )
}
