import type { Metadata } from 'next'
import PhraseReference from '@/components/PhraseReference'

export const metadata: Metadata = { title: 'Explicit phrase reference | Babson Radio', robots: { index: false, follow: false } }

// Anyone can open this, signed in or not. The training's agreement and quiz point here; the studio booth has the same checker.
export default function WordsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Explicit phrase reference</h1>
      <p className="text-base text-br-dk-sub">
        Not sure if a word, a lyric or a phrase can go on air? Check it against the station’s word list. Slurs are never allowed.
        Explicit words and profanity are not allowed from 6 AM to 10 PM Eastern. Spellings with symbols, stars and stretched letters are caught too.
      </p>
      <PhraseReference />
      <p className="text-base text-br-dk-sub">
        The list can miss things. When in doubt, leave it out and ask the E-board. Nothing you type is saved.
      </p>
    </div>
  )
}
