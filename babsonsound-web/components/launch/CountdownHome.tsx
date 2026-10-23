import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import { CountdownTiles } from './Countdown'
import { LAUNCH_TEXT } from '@/lib/launch'

/** The public homepage until launch. Static markup; only the numbers tick, in the browser. */
export default function CountdownHome() {
  return (
    <main className="hw-stage relative z-[1] min-h-dvh flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/beaver.png" alt="" className="w-16 sm:w-20 h-auto mb-5 drop-shadow-[0_3px_6px_rgba(0,0,0,.45)]" />
      <p className="font-display uppercase tracking-[0.4em] text-br-gold text-sm mb-3">Babson Radio</p>
      <h1 className="font-display uppercase text-br-dk-text text-5xl sm:text-7xl lg:text-8xl leading-[0.95] tracking-wide mb-8 sm:mb-10">Radio is back</h1>

      <CountdownTiles />
      <p className="text-br-dk-sub text-base sm:text-lg mt-8 sm:mt-10 mb-8">October 30 at 10am Eastern</p>

      <Link href="/auth?mode=create" className="sk-btn font-display uppercase tracking-[0.2em] text-sm px-12 py-3.5 rounded-xl">Sign up</Link>
      <p className="text-xs text-br-dk-sub mt-3">
        <Link href="/privacy" className="underline underline-offset-4">We&apos;ll email you when we launch.</Link>
      </p>
      <Link href="/auth" className="text-sm text-br-dk-sub hover:text-br-dk-text underline underline-offset-4 mt-6">Sign in</Link>
      <span className="sr-only">{LAUNCH_TEXT}</span>
    </main>
  )
}
