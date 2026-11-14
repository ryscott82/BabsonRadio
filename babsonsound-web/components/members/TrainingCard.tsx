import Link from 'next/link'
import { badgeLine, needsTraining, type BadgeRow } from '@/lib/membersPage'

/** The training status, and a link to /training (video, quiz, agreement) when it is missing or ended. Staff skip training. */
export default function TrainingCard({ badges, staff }: { badges: BadgeRow[]; staff: boolean }) {
  if (staff) return <p className="text-base text-br-dk-text">E-board and Admin do not need training. You can book the studio and host live.</p>
  const untrained = needsTraining(badges)
  return (
    <div className="space-y-4">
      <ul className="space-y-1">{badges.map(b => <li key={b.name} className={`text-base ${b.expired || !b.has ? 'text-br-dk-sub' : 'text-br-dk-text'}`}>{badgeLine(b)}</li>)}</ul>
      {untrained && (
        <>
          <p className="text-base text-br-dk-text">One training covers the studio, the radio and going live: a 6-minute video, a short quiz and the agreement.</p>
          <Link href="/training" className="sk-key inline-flex items-center rounded-lg px-4 min-h-11 text-base font-semibold text-br-dk-text">{badges.some(b => b.expired) ? 'Retake the training' : 'Take the training'}</Link>
        </>
      )}
    </div>
  )
}
