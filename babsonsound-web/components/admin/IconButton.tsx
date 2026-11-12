'use client'

import OpsIcon, { type OpsIcon as IconName } from '@/components/admin/OpsIcons'

/**
 * A control: the icon with its name beside it (always shown, no description). aria-label always; a short tooltip on hover and on keyboard focus.
 * `on` fills the icon (a switch that is on). `red` is the emergency colour.
 */
export default function IconButton({ label, tip, icon, on, pressed, red, busy, onClick, expanded }: {
  label: string; tip: string; icon: IconName; on?: boolean; pressed?: boolean; red?: boolean; busy?: boolean; caption?: boolean; onClick: () => void; expanded?: boolean
}) {
  const state = on === undefined ? '' : on ? ', on' : ', off'
  return (
    <div className="group relative">
      <button type="button" aria-label={`${label}${state}`} aria-pressed={pressed} aria-expanded={expanded} disabled={busy} onClick={onClick}
              className={`${red ? 'ops-btn-red' : 'ops-btn'} w-full min-h-14 px-3 flex items-center gap-3 text-left disabled:opacity-50`}>
        <OpsIcon name={icon} size={30} filled={on === true} />
        <span className="text-lg leading-tight">{label}</span>
      </button>
      <span role="tooltip" className="pointer-events-none absolute top-full left-0 mt-2 z-30 w-max max-w-[16rem] rounded-md bg-black text-white text-base px-3 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:hidden">{tip}</span>
    </div>
  )
}
