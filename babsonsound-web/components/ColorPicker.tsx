'use client'

// Event color: a few ready-made colors, a custom picker, and "default" (no color).
export const EVENT_COLORS = ['#e8b84a', '#2fb67c', '#3a8dde', '#8b5cf6', '#e0558a', '#f0703c', '#d94545', '#14b8c4']

export default function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div>
      <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">Color</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange('')} aria-pressed={value === ''}
                className={`h-8 px-3 rounded-full text-xs border ${value === '' ? 'border-br-gold text-br-gold' : 'border-br-dk-border text-br-dk-sub'}`}>
          Default
        </button>
        {EVENT_COLORS.map(c => (
          <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Use color ${c}`} aria-pressed={value === c}
                  className={`w-8 h-8 rounded-full border-2 ${value === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
        ))}
        <label className="flex items-center gap-1.5 text-xs text-br-dk-sub cursor-pointer">
          <input type="color" value={value || '#2fb67c'} onChange={e => onChange(e.target.value)}
                 className="w-8 h-8 rounded-full bg-transparent border-0 p-0 cursor-pointer" aria-label="Pick any color" />
          Custom
        </label>
      </div>
    </div>
  )
}
