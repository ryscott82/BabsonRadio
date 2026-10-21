import type { Metadata } from 'next'

// Private type test: the live amp set in the current fonts (Barlow) next to Normalidad Extended Bold (Adobe Fonts kit uag7bwr).
// Not linked anywhere and kept out of search results. Delete this folder when the test is done.
export const metadata: Metadata = { title: 'Font test | Babson Radio', robots: { index: false, follow: false } }

const NORMALIDAD = '"normalidad-extended", system-ui, sans-serif'
// Casey Neistat (a local file): a display face, so it sets the titles only. It lacks ' · – — é and curly quotes, so those fall back to Barlow.
const CASEY = '"casey-neistat", \'Barlow Condensed\', \'Barlow\', sans-serif'

function Amp({ label, display, body, scale = 1 }: { label: string; display: string; body: string; scale?: number }) {
  return (
    <div className="space-y-3 min-w-0">
      <p className="text-xs tracking-[0.2em] text-br-dk-muted">{label}</p>
      <div className="hw-panel hw-big" style={{ ['--t-display' as string]: display, ['--t-body' as string]: body, ['--s' as string]: scale }}>
        <div style={{ fontFamily: 'var(--t-display)', fontWeight: 700, fontSize: 'calc(2.6rem * var(--s))', lineHeight: 1.05, letterSpacing: '.005em' }}>Everybody Talks</div>
        <p style={{ fontFamily: 'var(--t-body)', fontSize: 'calc(1.25rem * var(--s))', fontWeight: 600, marginTop: 6 }}>Neon Trees</p>
        <p style={{ fontFamily: 'var(--t-body)', fontSize: 'calc(.95rem * var(--s))', marginTop: 14, opacity: .8 }}>Next: Makes you wonder · bassvictim - Topic</p>
        <div style={{ fontFamily: 'var(--t-display)', fontWeight: 700, fontSize: 'calc(1.55rem * var(--s))', lineHeight: 1.1, marginTop: 22 }}>Bohemian Rhapsody (Remastered 2011)</div>
        <p style={{ fontFamily: 'var(--t-body)', fontSize: 'calc(1rem * var(--s))', marginTop: 6 }}>Queen · A Night at the Opera</p>
        <div className="flex flex-wrap gap-2 mt-6">
          {['Live', 'Schedule', 'Library', 'Search', 'Suggest', 'About'].map(t => (
            <span key={t} className="sk-key hw-pill text-sm font-semibold px-4 h-9 inline-flex items-center rounded-full" style={{ fontFamily: 'var(--t-body)' }}>{t}</span>
          ))}
        </div>
        <p style={{ fontFamily: 'var(--t-body)', fontSize: 'calc(.9rem * var(--s))', marginTop: 22, lineHeight: 1.5 }}>
          Babson Radio is the student-run internet radio station of Babson College. 0123456789 · ON AIR · 4:23 PM
        </p>
      </div>
    </div>
  )
}

export default function FontTestPage() {
  return (
    <div className="max-w-[1800px] mx-auto px-4 py-10 space-y-6">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://use.typekit.net/uag7bwr.css" />
      <style>{`@font-face { font-family: 'casey-neistat'; src: url('/fonts/casey-neistat.ttf') format('truetype'); font-weight: 400 700; font-display: swap; }`}</style>
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.08em]">Font test</h1>
      <p className="text-sm text-br-dk-sub">First: what the site uses now. The others: Normalidad Extended Bold for titles and Normalidad Extended for the small text, at smaller sizes so as many words fit as with the condensed font.</p>
      <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <Amp label="NOW: BARLOW CONDENSED + BARLOW" display="'Barlow Condensed', 'Barlow', sans-serif" body="'Barlow', system-ui, sans-serif" />
        <Amp label="TEST: NORMALIDAD EXTENDED, 62% SIZE" display={NORMALIDAD} body={NORMALIDAD} scale={0.62} />
        <Amp label="TEST: NORMALIDAD EXTENDED, 52% SIZE" display={NORMALIDAD} body={NORMALIDAD} scale={0.52} />
        <Amp label="TEST: CASEY NEISTAT TITLES + BARLOW" display={CASEY} body="'Barlow', system-ui, sans-serif" />
        <Amp label="TEST: CASEY NEISTAT, LARGER" display={CASEY} body="'Barlow', system-ui, sans-serif" scale={1.3} />
      </div>
    </div>
  )
}
