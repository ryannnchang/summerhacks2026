import { NavLink, Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from './hooks/useAuth'
import { GroupPage } from './pages/GroupPage'
import { GroupsPage } from './pages/GroupsPage'
import { MuralPage } from './pages/MuralPage'

export default function App() {
  const { user, loading, error, newIdentity } = useAuth()

  if (loading) return <div className="page">Getting you a name…</div>

  if (error || !user) {
    return (
      <div className="page">
        <p className="alert alert--error">
          {error ?? 'Could not start a session.'} Is the API running on :8000?
        </p>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/" className="nav__brand">
          🌱 TouchGrass
        </NavLink>
        <div className="nav__links">
          <NavLink to="/">Groups</NavLink>
          <NavLink to="/mural">Mural</NavLink>
        </div>
        <span className="nav__user">@{user.username}</span>
        <button
          className="button button--link"
          onClick={() => void newIdentity()}
          title="Start over as someone else — handy for testing a second player"
        >
          new identity
        </button>
      </nav>

      <Routes>
        <Route path="/" element={<GroupsPage />} />
        <Route path="/groups/:groupId" element={<GroupPage />} />
        <Route path="/mural" element={<MuralPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
