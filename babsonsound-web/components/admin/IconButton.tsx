'use client'

import OpsIcon, { type OpsIcon as IconName } from '@/components/admin/OpsIcons'

/**
 * An icon button: aria-label always; a tooltip on hover and on keyboard focus; on touch and phone widths (no hover) a caption under the icon instead.
 * `on` fills the icon (a switch that is on). `red` is the emergency colour. The tooltip needs no script: it shows with hover or focus-within.
 */
export default function IconButton({ label, tip, icon, on, pressed, red, busy, caption, onClick, expanded }: {
  label: string; tip: string; icon: IconName; on?: boolean; pressed?: boolean; red?: boolean; busy?: boolean; caption?: boolean; onClick: () => void; expanded?: boolean
}) {
  const state = on === undefined ? '' : on ? ', on' : ', off'
  return (
    <div className="group relative flex flex-col items-center">
      <button type="button" aria-label={`${label}${state}`} aria-pressed={pressed} aria-expanded={expanded} disabled={busy} onClick={onClick}
              className={`${red ? 'ops-btn-red' : 'ops-btn'} w-14 h-14 inline-flex items-center justify-center disabled:opacity-50`}>
        <OpsIcon name={icon} size={30} filled={on === true} />
      </button>
      <span role="tooltip" className="pointer-events-none absolute top-full mt-2 z-30 w-max max-w-[16rem] rounded-md bg-black text-white text-base px-3 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:hidden">
        <span className="font-semibold">{label}</span><span className="block opacity-90">{tip}</span>
      </span>
      <span className={`mt-1 text-base leading-tight text-center max-w-[5.5rem] ${caption ? 'block' : 'md:hidden [@media(hover:none)]:block'}`}>{label}</span>
    </div>
  )
}
