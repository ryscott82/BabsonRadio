'use client'

import { useState } from 'react'
import Link from 'next/link'

// The right side of the home page on desktop: one panel at a time instead of three stacked sections, so nothing scrolls.
// On phones the panels simply stack.
export default function HomeTabs({ tabs }: { tabs: { id: string; label: string; href?: string; node: React.ReactNode }[] }) {
  const [id, setId] = useState(tabs[0]?.id ?? '')
  const cur = tabs.find(t => t.id === id) ?? tabs[0]
  if (!cur) return null
  return (
    <section className="min-w-0 flex flex-col lg:h-full lg:min-h-0">
      <div className="flex items-center gap-1 border-b border-br-dk-border mb-4 shrink-0" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={t.id === cur.id} onClick={() => setId(t.id)}
                  className={`font-display tracking-widest text-sm px-4 py-2 -mb-px border-b-2 transition-colors ${
                    t.id === cur.id ? 'border-br-gold text-br-gold' : 'border-transparent text-br-dk-sub hover:text-br-dk-text'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4">
          {cur.href && <Link href={cur.href} className="font-display text-br-dk-sub hover:text-br-gold text-xs tracking-widest">See all</Link>}
          <Link href="/slots" className="sk-btn font-display text-[14px] tracking-[0.2em] px-3 py-1.5 rounded-lg mb-1">Request a spot</Link>
        </div>
      </div>
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-1" role="tabpanel">{cur.node}</div>
    </section>
  )
}
