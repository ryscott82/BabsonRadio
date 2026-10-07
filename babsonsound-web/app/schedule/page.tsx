import { getSchedule } from '@/lib/firestore'
import UpcomingSlots from './UpcomingSlots'

export const revalidate = 60

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Row { id: string; dayOfWeek: number; startTime: string; showName: string; hostNames?: string[] }

export default async function SchedulePage() {
  const rows = (await getSchedule()) as unknown as Row[]
  const byDay = DAYS.map((name, i) => ({ name, items: rows.filter(r => r.dayOfWeek === i) }))
  const today = new Date().getDay()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">SCHEDULE</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-br-gold tracking-widest text-sm">EVERY WEEK</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-br-dk-sub">The weekly lineup will show up here once it&apos;s set.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {byDay.filter(d => d.items.length).map(d => (
              <div key={d.name} className="sk-raised rounded-xl p-4">
                <p className={`font-display tracking-widest text-sm mb-2 ${DAYS.indexOf(d.name) === today ? 'text-br-gold' : 'text-br-dk-sub'}`}>
                  {d.name.toUpperCase()}{DAYS.indexOf(d.name) === today ? ' · TODAY' : ''}
                </p>
                <ul className="space-y-2">
                  {d.items.map(r => (
                    <li key={r.id} className="flex gap-3 text-sm">
                      <span className="font-display tracking-wider text-br-dk-sub w-20 shrink-0">{r.startTime}</span>
                      <span className="text-br-dk-text">
                        {r.showName}
                        {r.hostNames?.length ? <span className="block text-xs text-br-dk-muted">{r.hostNames.join(', ')}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <UpcomingSlots />
    </div>
  )
}
