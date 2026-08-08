import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { ApiError, api } from '../api/client'
import {
  clearSession,
  getActiveGroupId,
  getUserId,
  setActiveGroupId,
  setUserId,
} from '../lib/session'
import type { User } from '../types'

interface SessionValue {
  user: User | null
  groupId: number | null
  /** True until the stored identity has been checked against the server. */
  loading: boolean
  /** Claims `username`, reusing the account if it already exists. */
  signIn: (username: string, displayName?: string) => Promise<User>
  selectGroup: (groupId: number | null) => void
  signOut: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [groupId, setGroupId] = useState<number | null>(() => getActiveGroupId())
  const [loading, setLoading] = useState(true)

  // Revive the stored identity on boot. A stale id (server wiped, db reset) just
  // drops us back to signed-out rather than wedging the app on a 401 loop.
  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (getUserId() === null) {
        if (!cancelled) setLoading(false)
        return
      }
      const me = await api.me().catch(() => null)
      if (cancelled) return
      if (me) {
        setUser(me)
      } else {
        clearSession()
        setGroupId(null)
      }
      setLoading(false)
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (username: string, displayName?: string) => {
    // Sign-in and sign-up are the same gesture here: take the name if it's free,
    // otherwise walk back into the existing account.
    let next = await api.lookupUser(username).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    })
    if (!next) next = await api.signUp(username, displayName)

    setUserId(next.id)
    setUser(next)
    return next
  }, [])

  const selectGroup = useCallback((next: number | null) => {
    setActiveGroupId(next)
    setGroupId(next)
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    setUser(null)
    setGroupId(null)
  }, [])

  const value = useMemo<SessionValue>(
    () => ({ user, groupId, loading, signIn, selectGroup, signOut }),
    [user, groupId, loading, signIn, selectGroup, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}
