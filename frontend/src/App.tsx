import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { BottomNav } from './components/BottomNav'
import { useSession } from './hooks/useSession'
import { takeReturnTo } from './lib/session'
import { AuthPage } from './pages/AuthPage'
import { CapturePage } from './pages/CapturePage'
import { MapPage } from './pages/MapPage'
import { ProfilePage } from './pages/ProfilePage'
import { RankedPage } from './pages/RankedPage'
import { ReviewPage } from './pages/ReviewPage'

/** Full-bleed spinner, shown while the stored identity is checked. */
function Warmup() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-2 border-scoreboard border-t-transparent rounded-full animate-spin" />
      <p className="font-mono text-chalk/50 text-sm">warming up the field…</p>
    </main>
  )
}

/**
 * Gate for the camera flow only. The rankings and the map are open to everyone —
 * signing in is what you do when you want to put grass on the board yourself.
 */
function RequireSession({ children }: { children: ReactNode }) {
  const { user, session, loading, error } = useSession()
  const { pathname } = useLocation()

  if (loading) return <Warmup />

  // Signed in with Google but the backend link failed — bouncing to /auth would
  // just loop, since Supabase still has a valid session.
  if (session && !user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-3xl tracking-wide text-chalk">CAN'T REACH THE FIELD</p>
        <p className="text-dirt-light text-sm max-w-xs">{error ?? 'The game server is down.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-xl tracking-wide px-6 py-2.5 rounded-xl transition-colors"
        >
          RETRY
        </button>
      </main>
    )
  }

  if (!user) return <Navigate to="/auth" state={{ returnTo: pathname }} replace />
  return <>{children}</>
}

/**
 * Google sends the browser back to the app root, which loses whatever page the
 * visitor was trying to reach. This forwards them once the account is linked.
 */
function useReturnToAfterSignIn() {
  const { user } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    const path = takeReturnTo()
    if (path && path !== window.location.pathname) navigate(path, { replace: true })
  }, [user, navigate])
}

export default function App() {
  const { user, loading } = useSession()
  const { pathname } = useLocation()

  useReturnToAfterSignIn()

  // The camera flow is deliberately chrome-free; it has its own back button.
  const showNav = ['/', '/map', '/profile'].includes(pathname)

  return (
    <>
      <Routes>
        {/* Public — anyone can watch the rankings and the map. */}
        <Route path="/" element={<RankedPage />} />
        <Route path="/map" element={<MapPage />} />

        <Route
          path="/auth"
          element={loading ? <Warmup /> : user ? <Navigate to="/" replace /> : <AuthPage />}
        />

        {/* Signing in is required to put a photo on the board. */}
        <Route
          path="/capture"
          element={
            <RequireSession>
              <CapturePage />
            </RequireSession>
          }
        />
        <Route
          path="/review"
          element={
            <RequireSession>
              <ReviewPage />
            </RequireSession>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireSession>
              <ProfilePage />
            </RequireSession>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showNav && <BottomNav />}
    </>
  )
}
