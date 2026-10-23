'use client'

import { useState } from 'react'
import { deleteMyAccount, signOut } from '@/lib/auth'
import { ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'
import { CountdownLine } from './Countdown'
import { LAUNCH_TEXT } from '@/lib/launch'

/** What a signed-in, locked account sees: nothing else on the site. */
export default function WaitingScreen() {
  const [deleting, setDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function remove(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await deleteMyAccount(password) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete the account.'); setBusy(false) }
  }

  return (
    <main className="hw-stage relative z-[1] min-h-dvh flex flex-col items-center justify-center px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/beaver.png" alt="" className="w-16 h-auto mb-6 drop-shadow-[0_3px_6px_rgba(0,0,0,.45)]" />
      <h1 className="font-display text-br-dk-text text-3xl sm:text-4xl leading-tight max-w-md mb-4">
        Come back {LAUNCH_TEXT} for the launch of Babson Radio!
      </h1>
      <CountdownLine />

      <div className="mt-10 w-full max-w-xs space-y-3">
        {!deleting ? (
          <>
            <PrimaryButton type="button" onClick={() => signOut()}>Sign out</PrimaryButton>
            <GhostButton type="button" onClick={() => setDeleting(true)} className="block mx-auto underline underline-offset-4">Delete my account</GhostButton>
          </>
        ) : (
          <form onSubmit={remove} className="space-y-4 text-left sk-raised rounded-2xl p-5">
            <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                   autoComplete="current-password" autoFocus />
            <ErrorText>{error}</ErrorText>
            <PrimaryButton type="submit" busy={busy} disabled={!password}>Delete account</PrimaryButton>
            <GhostButton type="button" onClick={() => { setDeleting(false); setError(''); setPassword('') }} className="block mx-auto">Cancel</GhostButton>
          </form>
        )}
      </div>
    </main>
  )
}
