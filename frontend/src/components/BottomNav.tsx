import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/dashboard', label: 'HOME' },
  { to: '/capture', label: 'PLAY' },
  { to: '/leaderboard', label: 'RANKS' },
  { to: '/map', label: 'MAP' },
  { to: '/mural', label: 'MURAL' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-turf-800 border-t-2 border-scoreboard/40">
      <div className="max-w-md mx-auto flex items-stretch">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 py-3 text-center font-mono text-[11px] tracking-widest transition-colors ${
                isActive
                  ? 'text-scoreboard border-t-2 -mt-[2px] border-scoreboard'
                  : 'text-chalk/50 hover:text-chalk/80'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
