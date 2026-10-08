'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api, apiGet, onAuthChange, getUserDoc, isBabsonEmail, refreshUser } from '@/lib/auth'
import { hasUnlockCookie, rememberUnlock } from '@/lib/prelaunch-client'

interface UserDoc {
  id: string
  firstName?: string
  lastName?: string
  username?: string
  displayName: string
  email: string
  phoneNumber?: string
  role: 'developer' | 'superAdmin' | 'director' | 'showHost' | 'listener' | 'guest'
  accountType?: 'babson' | 'guest' | 'developer' | 'pending'
  betaStatus?: 'pending' | 'approved' | 'denied'
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
  isDirector: boolean
  isPendingTester: boolean
  isHost: boolean
  /** babson.edu address, verified */
  isBabson: boolean
  /** developer account (custom claim; no babson.edu email needed) */
  isDeveloper: boolean
  /** on the beta tester list (shows the report bug / feature button) */
  isTester: boolean
  /** signed in with a non-Babson email (guest account) */
  isGuest: boolean
  /** signed in with a babson.edu address that still needs verifying */
  needsVerification: boolean
  /** ms deadline to verify the email (only while the 3-day grace period is running), else null */
  verifyDeadline: number | null
  guestPass: GuestPass | null
  passActive: boolean
  /** LIVE radio: everyone who is signed in (students, developers, guests) */
  canListenLive: boolean
  /** Student features (reactions, ratings, slots, friends): students and developers only */
  hasMemberAccess: boolean
  /** The Library: students and developers, plus guests with a sponsor's pass or a student who has them in their contacts */
  hasLibraryAccess: boolean
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, userDoc: null, loading: true, isAdmin: false, isDirector: false, isPendingTester: false, isHost: false,
  isBabson: false, isDeveloper: false, isTester: false, isGuest: false, needsVerification: false, verifyDeadline: null,
  guestPass: null, passActive: false,
  canListenLive: false, hasMemberAccess: false, hasLibraryAccess: false,
  reload: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [userDoc, setUserDoc]   = useState<UserDoc | null>(null)
  const [guestPass, setPass]    = useState<GuestPass | null>(null)
  const [guestLibrary, setGuestLibrary] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [isDeveloper, setDev]   = useState(false)
  const [graceUntil, setGrace]  = useState(0)
  const [testerClaim, setTesterClaim] = useState(false)
  const [openClaim, setOpenClaim] = useState(false)
  const [onTesterList, setOnTesterList] = useState(false)
  const [now, setNow]           = useState(() => Date.now())

  // Pre-launch: a signed-in beta tester gets the pass for the site (no developer password needed).
  useEffect(() => {
    if (!user || user.uid === 'preview-developer' || hasUnlockCookie()) return
    api<{ gate: string }>('/api/prelaunch/session', {})
      .then(r => {
        rememberUnlock(r.gate, null, true)
        if (location.pathname === '/coming-soon') location.replace('/')
      })
      .catch(() => {}) // not on the tester list (or the site is already open)
  }, [user])

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult().catch(() => null)
        setDev(tokenResult?.claims.developer === true)
        setGrace(typeof tokenResult?.claims.graceUntil === 'number' ? tokenResult.claims.graceUntil : 0)
        setTesterClaim(tokenResult?.claims.tester === true)
        apiGet<{ isTester?: boolean }>('/api/me').then(m => setOnTesterList(m.isTester === true)).catch(() => {})
        setUserDoc((await getUserDoc(firebaseUser.uid).catch(() => null)) as UserDoc | null)
      } else {
        setUserDoc(null)
        setPass(null)
        setGuestLibrary(false)
        setDev(false)
        setGrace(0)
        setTesterClaim(false)
        setOnTesterList(false)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Live guest pass + trial (so approval/revocation shows up without a refresh).
  useEffect(() => {
    if (!user) return
    const u1 = onSnapshot(
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
    return () => { u1() }
  }, [user])

  // Re-evaluate at the moment the next trial/pass expires.
  useEffect(() => {
    const ends = [graceUntil || null, guestPass && !guestPass.revoked ? guestPass.expiresAt : null]
      .filter((t): t is number => t !== null && t > Date.now())
    if (!ends.length) return
    const ms = Math.min(...ends) - Date.now()
    const t = setTimeout(() => setNow(Date.now()), Math.min(ms + 500, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [guestPass, graceUntil])

  const reload = useCallback(async () => {
    const u = await refreshUser()
    setUser(u)
    const claims = (await u?.getIdTokenResult(true))?.claims
    setDev(claims?.developer === true)
    setGrace(typeof claims?.graceUntil === 'number' ? claims.graceUntil : 0)
    setTesterClaim(claims?.tester === true)
    setOpenClaim(claims?.openMember === true)
    setNow(Date.now())
    if (u) setUserDoc((await getUserDoc(u.uid).catch(() => null)) as UserDoc | null)
  }, [])

  const babsonEmail = !!user?.email && (isBabsonEmail(user.email) || testerClaim || openClaim)
  const inGrace = graceUntil > now
  const isBabson = babsonEmail && (user!.emailVerified || inGrace)
  const needsVerification = babsonEmail && !user!.emailVerified && !inGrace
  const verifyDeadline = babsonEmail && !user!.emailVerified && inGrace ? graceUntil : null
  const isTester = !!user && (testerClaim || onTesterList)
  const isPendingTester = !!user && userDoc?.betaStatus === 'pending' && !babsonEmail
  const isGuest = !!user && !babsonEmail && !isDeveloper && !isPendingTester
  const passActive = !!guestPass && !guestPass.revoked && guestPass.expiresAt > now

  // Does this guest get the Library? The server decides (sponsor pass, or a student has them in their contacts).
  useEffect(() => {
    if (!user || !isGuest) { queueMicrotask(() => setGuestLibrary(false)); return }
    let live = true
    apiGet<{ canAccessBacklog?: boolean }>('/api/guest/status')
      .then(s => { if (live) setGuestLibrary(s.canAccessBacklog === true) })
      .catch(() => { if (live) setGuestLibrary(false) })
    return () => { live = false }
  }, [user, isGuest, passActive, now])
  const isStudent = isBabson || isDeveloper
  const isAdmin = isDeveloper || (isBabson && userDoc?.role === 'superAdmin')
  const isDirector = isAdmin || (isBabson && userDoc?.role === 'director')
  const isHost  = isAdmin || (isBabson && userDoc?.role === 'showHost')

  return (
    <AuthContext.Provider value={{
      user, userDoc, loading, isAdmin, isDirector, isHost, isBabson, isDeveloper, isTester, isGuest, isPendingTester, needsVerification, verifyDeadline,
      guestPass, passActive,
      canListenLive: isStudent || isGuest,
      hasMemberAccess: isStudent,
      hasLibraryAccess: isStudent || (isGuest && guestLibrary),
      reload,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
