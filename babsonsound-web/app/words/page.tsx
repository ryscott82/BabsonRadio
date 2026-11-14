'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { openSignIn } from '@/lib/signInPrompt'
import PhraseReference from '@/components/PhraseReference'

// Signed-in members who have done the training (E-board and Admins count). The studio booth has the same checker once someone signs in.
export default function WordsPage() {
  const { user, loading, studioTrained, radioTrained } = useAuth()
  const title = <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Explicit phrase reference</h1>
  if (loading) return null
  if (!user) return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
      {title}
      <p className="text-base text-br-dk-sub">For trained Babson Radio members. Sign in to use it.</p>
      <button type="button" className="sk-key rounded-xl px-5 min-h-11 text-base font-semibold text-br-dk-text" onClick={() => openSignIn()}>Sign in</button>
    </div>
  )
  if (!studioTrained && !radioTrained) return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
      {title}
      <p className="text-base text-br-dk-sub">For trained members. Finish the training first, then you can check words here.</p>
      <Link href="/training" className="sk-key inline-flex items-center rounded-xl px-5 min-h-11 text-base font-semibold text-br-dk-text">Take the training</Link>
    </div>
  )
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      {title}
      <p className="text-base text-br-dk-sub">
        Not sure if a word, a lyric or a phrase can go on air? Check it against the station’s word list. Slurs are never allowed.
        Explicit words and profanity are not allowed from 6 AM to 10 PM Eastern. Spellings with symbols, stars and stretched letters are caught too.
      </p>
      <PhraseReference />
      <p className="text-base text-br-dk-sub">The list can miss things. When in doubt, leave it out and ask the E-board. Nothing you type is saved.</p>
    </div>
  )
}
