import ScheduleList from './ScheduleList'
import { CALENDAR_URL } from '@/lib/links'

export default function SchedulePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-3 lg:space-y-2 fit">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Schedule</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-base text-br-dk-sub">
        <a href={CALENDAR_URL.replace(/^https?:/, 'webcal:')} className="text-br-gold underline underline-offset-2">Subscribe to the Babson Radio calendar</a>
      </p>
      <ScheduleList />
    </div>
  )
}
