'use client'

import { POLICY_TEXT } from '@/lib/hostFlow'

/** The policy tick on the request and booking screens. The server refuses the request without it. */
export default function PolicyBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-base text-br-dk-text">
      <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{POLICY_TEXT}</span>
    </label>
  )
}
