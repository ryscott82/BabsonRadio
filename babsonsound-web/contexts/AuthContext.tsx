'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { onAuthChange, getUserDoc, isBabsonEmail, refreshUser } from '@/lib/auth'

interface UserDoc {
  id: string
  firstName?: string
  displayName: string
  email: string
  phoneNumber?: string
  role: 'developer' | 'superAdmin' | 'showHost' | 'listener' | 'guest'
  accountType?: 'babson' | 'guest' | 'developer'
  hostOfShows: string[]
  [key: string]: unknown
}

export interface GuestPass {
  sponsorName: string
  expiresAt: number // ms
  revoked: boolean
}

interface AuthContextValue {
  user: User | null
  userDoc: UserDoc | null
  loading: boolean
  isAdmin: boolean
  isHost: boolean
  /** babson.edu address, verified */
  isBabson: boolean
  /** developer account (custom claim; no babson.edu email needed) */
  isDeveloper: boolean
  /** signed in with a babson.edu address that still needs verifying */
  needsVerification: boolean
  guestPass: GuestPass | null
  /** Babson student OR guest with an active pass → locked content is open */
  hasMemberAccess: boolean
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, userDoc: null, loading: true, isAdmin: false, isHost: false,
  isBabson: false, isDeveloper: false, needsVerification: false, guestPass: null, hasMemberAccess: false,
  reload: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [userDoc, setUserDoc]   = useState<UserDoc | null>(null)
  const [guestPass, setPass]    = useState<GuestPass | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isDeveloper, setDev]   = useState(false)
  const [now, setNow]           = useState(() => Date.now())

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult().catch(() => null)
        setDev(tokenResult?.claims.developer === true)
        setUserDoc((await getUserDoc(firebaseUser.uid).catch(() => null)) as UserDoc | null)
      } else {
        setUserDoc(null)
        setPass(null)
        setDev(false)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Live guest pass (so approval/revocation shows up without a refresh).
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      doc(db, 'guestPasses', user.uid),
      snap => setPass(snap.exists()
        ? {
            sponsorName: snap.get('sponsorName'),
            expiresAt: snap.get('expiresAt').toMillis(),
            revoked: snap.get('revoked') === true,
          }
        : null),
      () => setPass(null),
    )
  }, [user])

  // Re-evaluate at the moment a pass expires.
  useEffect(() => {
    if (!guestPass || guestPass.revoked) return
    const ms = guestPass.expiresAt - Date.now()
    if (ms <= 0) return
    const t = setTimeout(() => setNow(Date.now()), Math.min(ms + 500, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [guestPass])

  const reload = useCallback(async () => {
    const u = await refreshUser()
    setUser(u)
    setDev((await u?.getIdTokenResult())?.claims.developer === true)
    setNow(Date.now())
    if (u) setUserDoc((await getUserDoc(u.uid).catch(() => null)) as UserDoc | null)
  }, [])

  const babsonEmail = !!user?.email && isBabsonEmail(user.email)
  const isBabson = babsonEmail && user!.emailVerified
  const needsVerification = babsonEmail && !user!.emailVerified
  const passActive = !!guestPass && !guestPass.revoked && guestPass.expiresAt > now
  const isAdmin = isDeveloper || (isBabson && userDoc?.role === 'superAdmin')
  const isHost  = isAdmin || (isBabson && userDoc?.role === 'showHost')

  return (
    <AuthContext.Provider value={{
      user, userDoc, loading, isAdmin, isHost, isBabson, isDeveloper, needsVerification,
      guestPass, hasMemberAccess: isBabson || isDeveloper || passActive, reload,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
