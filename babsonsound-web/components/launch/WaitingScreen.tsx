'use client'

import { CountdownLine } from './Countdown'
import { LAUNCH_TEXT } from '@/lib/launch'

/** What a signed-in, locked account sees: nothing else on the site. */
export default function WaitingScreen() {
  return (
    <main className="hw-stage relative z-[1] min-h-dvh flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="hw-panel p-[calc(var(--hw-rim)+6px)]! sm:p-[calc(var(--hw-rim)+34px)]! flex flex-col items-center w-full max-w-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/beaver.png" alt="" className="w-16 h-auto mb-6 drop-shadow-[0_3px_6px_rgba(0,0,0,.45)]" />
      <h1 className="font-display text-br-dk-text text-3xl sm:text-4xl leading-tight max-w-md mb-4">
        Come back {LAUNCH_TEXT} for the launch of Babson Radio!
      </h1>
      <CountdownLine />

      </div>
    </main>
  )
}
