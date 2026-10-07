'use client'

import type { InputHTMLAttributes, ReactNode } from 'react'

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">{label.toUpperCase()}</span>
      <input
        {...props}
        className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text placeholder:text-br-dk-muted focus:outline-none"
      />
    </label>
  )
}

/** Sponsor entry: people type only the part before @babson.edu, which is shown after the box. */
export function BabsonEmailField({ label, value, onChange, placeholder = 'username' }: {
  label: string; value: string; onChange: (prefix: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">{label.toUpperCase()}</span>
      <div className="sk-field flex items-center rounded-xl pr-4 focus-within:ring-2 focus-within:ring-br-gold/40">
        <input
          type="text" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value.split('@')[0].replace(/\s/g, ''))}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-br-dk-text placeholder:text-br-dk-muted focus:outline-none"
        />
        <span className="text-sm text-br-dk-sub shrink-0">@babson.edu</span>
      </div>
    </label>
  )
}

export function PrimaryButton({ busy, children, ...p }: { busy?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      disabled={busy || p.disabled}
      className="sk-btn w-full font-display tracking-[0.2em] text-sm py-3.5 rounded-xl disabled:opacity-50"
    >
      {busy ? 'ONE MOMENT…' : children}
    </button>
  )
}

export function GhostButton(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`font-display tracking-widest text-xs text-br-dk-sub hover:text-br-dk-text transition-colors ${p.className ?? ''}`}
    />
  )
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <p role="alert" className="text-br-red text-sm">{children}</p> : null
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="font-display text-br-dk-text text-4xl tracking-[0.15em]">{title}</h1>
        {subtitle && <p className="text-br-dk-sub text-sm mt-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/** (XXX) XXX-XXXX while typing */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
