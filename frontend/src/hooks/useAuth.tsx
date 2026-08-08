import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, getUserId, setUserId } from '../api/client'
import type { User } from '../types'

interface AuthValue {
  user: User | null
  loading: boolean
  error: string | null
  /** Abandons the current identity and provisions a fresh one. */
  newIdentity: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function randomGuestName(): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `guest-${suffix}`
}

/** Claims a guest username, retrying on the (unlikely) collision. */
async function createGuest(): Promise<User> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await api.signUp(randomGuestName())
    } catch (err) {
      const conflict = err instanceof Error && err.message.toLowerCase().includes('taken')
      if (!conflict) throw err
    }
  }
  throw new Error('Could not claim a guest name')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const adopt = useCallback((next: User) => {
    setUserId(next.id)
    setUser(next)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        // Reuse the identity in localStorage; mint a new one if it's gone or stale.
        const stored = getUserId()
        const me = stored ? await api.me().catch(() => null) : null
        const next = me ?? (await createGuest())
        if (!cancelled) adopt(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [adopt])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      error,
      newIdentity: async () => {
        setUserId(null)
        adopt(await createGuest())
      },
    }),
    [user, loading, error, adopt],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
