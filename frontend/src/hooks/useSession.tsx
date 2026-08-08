import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { linkBackendUser } from '../lib/backendUser'
import { clearSession, setReturnTo, setUserId } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

interface SessionValue {
  /** The backend user row, once the Supabase identity has been linked to one. */
  user: User | null
  /** The raw Supabase session, for the avatar/email in the UI. */
  session: Session | null
  /** True until Supabase has reported a session and the backend link has resolved. */
  loading: boolean
  error: string | null
  /** `returnTo` is restored after the OAuth round-trip; defaults to the current page. */
  signInWithGoogle: (returnTo?: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Which Supabase account we've already linked, so token refreshes don't re-link.
  const linkedFor = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fires once for the restored session (or null), then again on every sign-in,
    // sign-out and token refresh — including the OAuth redirect landing.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return
      setSession(next)

      if (!next) {
        linkedFor.current = null
        clearSession()
        setUser(null)
        setLoading(false)
        return
      }

      if (linkedFor.current === next.user.id) {
        setLoading(false)
        return
      }
      linkedFor.current = next.user.id

      void linkBackendUser(next.user)
        .then((linked) => {
          if (cancelled) return
          setUserId(linked.id)
          setUser(linked)
          setError(null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          // Let the next auth event retry rather than stranding the account unlinked.
          linkedFor.current = null
          setError(err instanceof Error ? err.message : 'Could not reach the game server')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    setError(null)
    setReturnTo(returnTo ?? window.location.pathname)
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Comes back to the app root; App.tsx then forwards to the stored path.
      // Only this origin needs to be in Supabase's redirect allowlist.
      options: { redirectTo: window.location.origin },
    })
    if (authError) setError(authError.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    clearSession()
    setUser(null)
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      user,
      session,
      loading,
      error,
      signInWithGoogle,
      signOut,
    }),
    [user, session, loading, error, signInWithGoogle, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}
