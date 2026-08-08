import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { BottomNav } from './components/BottomNav'
import { useSession } from './hooks/useSession'
import { AuthPage } from './pages/AuthPage'
import { CapturePage } from './pages/CapturePage'
import { DashboardPage } from './pages/DashboardPage'
import { GroupPage } from './pages/GroupPage'
import { GroupsPage } from './pages/GroupsPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { MapPage } from './pages/MapPage'
import { MuralPage } from './pages/MuralPage'
import { ReviewPage } from './pages/ReviewPage'

/** Full-bleed spinner, reused for the boot check and the root redirect. */
function Warmup() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-2 border-scoreboard border-t-transparent rounded-full animate-spin" />
      <p className="font-mono text-chalk/50 text-sm">warming up the field…</p>
    </main>
  )
}

function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  if (loading) return <Warmup />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

export default function App() {
  const { user, loading } = useSession()
  const { pathname } = useLocation()

  // The bottom nav is the signed-in chrome; the auth screen stands alone.
  const showNav = Boolean(user) && pathname !== '/auth'

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={loading ? <Warmup /> : <Navigate to={user ? '/dashboard' : '/auth'} replace />}
        />
        <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />

        <Route
          path="/dashboard"
          element={
            <RequireSession>
              <DashboardPage />
            </RequireSession>
          }
        />
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
          path="/leaderboard"
          element={
            <RequireSession>
              <LeaderboardPage />
            </RequireSession>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireSession>
              <GroupsPage />
            </RequireSession>
          }
        />
        <Route
          path="/groups/:groupId"
          element={
            <RequireSession>
              <GroupPage />
            </RequireSession>
          }
        />

        {/* Public — the map and mural read across every group, no auth needed. */}
        <Route path="/map" element={<MapPage />} />
        <Route path="/mural" element={<MuralPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showNav && <BottomNav />}
    </>
  )
}
