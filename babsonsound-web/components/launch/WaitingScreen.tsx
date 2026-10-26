'use client'

import { CountdownBig } from './Countdown'

/** What a signed-in, locked account sees: nothing else on the site. */
export default function WaitingScreen() {
  return (
    <main className="hw-stage relative z-[1] min-h-dvh flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="hw-panel p-[calc(var(--hw-rim)+6px)]! sm:p-[calc(var(--hw-rim)+34px)]! flex flex-col items-center w-full max-w-4xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/beaver.png" alt="" className="w-16 h-auto mb-5 drop-shadow-[0_3px_6px_rgba(0,0,0,.45)]" />
        <p className="font-display tracking-[0.12em] text-br-gold text-sm mb-3">Babson Radio</p>
        <h1 className="font-display text-br-dk-text text-4xl sm:text-6xl leading-[0.98] tracking-wide mb-8">Come back at 10AM on Friday</h1>
        <CountdownBig />
        <p className="text-br-dk-sub text-base sm:text-lg mt-7">You&apos;re signed in. We&apos;ll open the doors on their own.</p>
      </div>
    </main>
  )
}
