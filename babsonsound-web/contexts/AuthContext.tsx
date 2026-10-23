'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User } from 'firebase/auth'
import { apiGet, ensureLaunchPass, onAuthChange, getUserDoc, refreshUser } from '@/lib/auth'

export type Level = 'guest' | 'student' | 'director' | 'admin'

/** What /api/me says about access. The server is the source of truth, so the browser does not guess from the email. */
interface Me { level: Level; studioTrained: boolean; radioTrained: boolean; isBabson: boolean }
const loadMe = () => apiGet<Me>('/api/me').catch(() => null)

interface UserDoc {
  id: string
  firstName?: string
  lastName?: string
  username?: string
  displayName: string
  email: string
  phoneNumber?: string
  /** One access level per person. Only the server writes it. */
  level?: Level
  studioTrained?: boolean
  radioTrained?: boolean
  accountType?: 'babson' | 'guest'
  [key: string]: unknown
}

interface AuthContextValue {
  user: User | null
  userDoc: UserDoc | null
  loading: boolean
  isAdmin: boolean
  isDirector: boolean
  /** guest | student | director | admin (guest until the profile loads) */
  level: Level
  /** badges; directors and admins count as both */
  studioTrained: boolean
  radioTrained: boolean
  /** student or above with a verified school email (the old name is kept so existing screens keep working) */
  isBabson: boolean
  /** signed in without a school email (a guest: live radio only) */
  isGuest: boolean
  /** signed in, email not verified, and the 7-day grace period is over */
  needsVerification: boolean
  /** ms deadline to verify the email (only while the 3-day grace period is running), else null */
  verifyDeadline: number | null
  /** LIVE radio: everyone who is signed in */
  canListenLive: boolean
  /** Student features (reactions, ratings, slots, friends): students and above */
  hasMemberAccess: boolean
  /** The Library: students and above */
  hasLibraryAccess: boolean
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, userDoc: null, loading: true, isAdmin: false, isDirector: false,
  level: 'guest', studioTrained: false, radioTrained: false,
  isBabson: false, isGuest: false, needsVerification: false, verifyDeadline: null,
  canListenLive: false, hasMemberAccess: false, hasLibraryAccess: false,
  reload: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [userDoc, setUserDoc]   = useState<UserDoc | null>(null)
  const [me, setMe]             = useState<Me | null>(null)
  const [loading, setLoading]   = useState(true)
  const [graceUntil, setGrace]  = useState(0)
  const [now, setNow]           = useState(() => Date.now())

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        await ensureLaunchPass() // before launch: early-access accounts get their pass before any page decides what to show
        const tokenResult = await firebaseUser.getIdTokenResult().catch(() => null)
        setGrace(typeof tokenResult?.claims.graceUntil === 'number' ? tokenResult.claims.graceUntil : 0)
        setUserDoc((await getUserDoc(firebaseUser.uid).catch(() => null)) as UserDoc | null)
        setMe(await loadMe())
      } else {
        setUserDoc(null)
        setMe(null)
        setGrace(0)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Re-evaluate when the 7-day verify window ends.
  useEffect(() => {
    if (graceUntil <= Date.now()) return
    const t = setTimeout(() => setNow(Date.now()), Math.min(graceUntil - Date.now() + 500, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [graceUntil])

  const reload = useCallback(async () => {
    const u = await refreshUser()
    setUser(u)
    const claims = (await u?.getIdTokenResult(true))?.claims
    setGrace(typeof claims?.graceUntil === 'number' ? claims.graceUntil : 0)
    setNow(Date.now())
    if (u) {
      setUserDoc((await getUserDoc(u.uid).catch(() => null)) as UserDoc | null)
      setMe(await loadMe())
    }
  }, [])

  const level: Level = me?.level ?? 'guest'
  const demo = userDoc?.demo === true // the hidden App Store reviewer account
  const inGrace = graceUntil > now
  const unverified = !!user && !user.emailVerified && !demo
  const isBabson = !!me?.isBabson && (user?.emailVerified === true || inGrace || demo)
  const needsVerification = unverified && !inGrace
  const verifyDeadline = unverified && inGrace ? graceUntil : null
  const isGuest = !!user && !me?.isBabson
  const isStudent = isBabson
  const isAdmin = isBabson && level === 'admin'
  const isDirector = isBabson && (level === 'admin' || level === 'director')
  const studioTrained = isDirector || (isBabson && me?.studioTrained === true)
  const radioTrained = isDirector || (isBabson && me?.radioTrained === true)

  return (
    <AuthContext.Provider value={{
      user, userDoc, loading, isAdmin, isDirector, level, studioTrained, radioTrained, isBabson, isGuest, needsVerification, verifyDeadline,
      canListenLive: isStudent || isGuest,
      hasMemberAccess: isStudent,
      hasLibraryAccess: isStudent,
      reload,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
