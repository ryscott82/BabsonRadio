'use client'

import { useCallback, useState } from 'react'
import { api } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import Turnstile from '@/components/Turnstile'

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i

// The form's address is not in this page or its scripts: it arrives in the answer to the email step and lives only in memory.
export default function StudioAccess() {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [url, setUrl] = useState('')
  const [embed, setEmbed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const onToken = useCallback((t: string) => setToken(t), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await api<{ url: string; embed: boolean }>('/api/studioaccess', { email: email.trim(), captchaToken: token })
      setUrl(r.url); setEmbed(r.embed)
    } catch (error) { setErr(error instanceof Error ? error.message : 'Could not open the form. Try again.') }
    setBusy(false)
  }

  if (url && !embed) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="hw-panel hw-big space-y-5">
          <h1 className="font-display text-br-dk-text text-3xl tracking-wide">Studio training</h1>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-full h-12 rounded-xl bg-white text-[#0f5233] font-semibold">Open the training form</a>
        </div>
      </div>
    )
  }

  if (url) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-wide">Studio training</h1>
        <iframe title="Studio training form" src={url} referrerPolicy="no-referrer"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="w-full rounded-xl bg-white border-0 h-[80vh] min-h-[640px]" />
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <form onSubmit={submit} className="hw-panel hw-big space-y-5" noValidate>
        <h1 className="font-display text-br-dk-text text-3xl tracking-wide">Studio training</h1>
        <Field label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
               value={email} onChange={e => setEmail(e.target.value)} maxLength={254} />
        <Turnstile onToken={onToken} />
        <ErrorText>{err}</ErrorText>
        <PrimaryButton type="submit" busy={busy} disabled={!EMAIL.test(email.trim())}>Submit</PrimaryButton>
      </form>
    </div>
  )
}
