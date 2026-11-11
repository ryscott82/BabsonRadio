'use client'

import { useState } from 'react'

const KEY = 'usageStepsClosed'
const STEPS: [string, string][] = [
  ['Open Vercel and sign in', 'Go to vercel.com and sign in with the account that owns the site. You land on the dashboard, a page with your projects as cards.'],
  ['Pick the team and the project', 'At the top left, the team name has a small menu arrow. Pick the Babson Radio team, then click the babson-radio project card.'],
  ['Open Usage', 'In the menu across the top of the team or project page, click Usage. If you do not see it, look under the team name or in the menu marked "More".'],
  ['Choose the period', 'Near the top right of the Usage page there is a date filter. Choose the current billing period so the numbers add up from the start of the month.'],
  ['Read four numbers', 'Scroll down the page. Find "Fluid Active CPU" (shown in hours and minutes, like 1h 20m), "Edge Requests", "Function Invocations" and "Fast Data Transfer". Each has a big total next to its name. Clicking Fluid Active CPU may show a breakdown by route.'],
  ['Type them in below', 'Use the date you read them on. You can paste numbers as Vercel shows them (1.2M, 800 MB, 1h 20m). Routes are optional.'],
]

// The first thing on the Server load page: how to read Vercel's Usage page. Open the first time, and it stays closed once someone closes it.
export default function Instructions() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) !== '1' } catch { return true } })
  return (
    <details className="ops-card p-4" open={open} onToggle={e => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); try { localStorage.setItem(KEY, o ? '0' : '1') } catch { /* private window */ } }}>
      <summary className="cursor-pointer text-xl min-h-[44px] flex items-center">How to check usage on Vercel</summary>
      <div className="space-y-4 pt-3">
        <ol className="space-y-3 list-decimal pl-6">
          {STEPS.map(([t, d]) => <li key={t}><span className="text-lg block">{t}</span><span className="block opacity-90">{d}</span></li>)}
        </ol>
        <ul className="space-y-1.5 list-disc pl-6 opacity-95">
          <li>The free (Hobby) plan has included about 4 hours of Active CPU a month. Vercel can change this.</li>
          <li>If the site goes over, Vercel may pause the whole site for about 30 days, so it is worth keeping an eye on.</li>
          <li>Vercel&apos;s numbers are the real ones. Our own meter is an estimate, and the history below shows how far apart they are.</li>
        </ul>
        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="ops-btn inline-flex items-center px-4 py-2 no-underline">Open the Vercel dashboard</a>
      </div>
    </details>
  )
}
