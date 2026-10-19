import ScheduleList from './ScheduleList'
import { CALENDAR_URL, AUTODJ_CALENDAR_URL } from '@/lib/links'

export default function SchedulePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-3 lg:space-y-2 fit">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Schedule</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-xs text-br-dk-sub">
        Want it in your calendar?{' '}
        <a href={CALENDAR_URL.replace(/^https?:/, 'webcal:')} className="text-br-gold">Subscribe</a>
        {' '}or paste <span className="text-br-dk-text select-all">{CALENDAR_URL}</span> into Google, Apple or Outlook calendar. It lists live shows only;{' '}
        <a href={AUTODJ_CALENDAR_URL.replace(/^https?:/, 'webcal:')} className="text-br-gold">the auto DJ playlists</a> have their own calendar.
      </p>
      <ScheduleList />
    </div>
  )
}
