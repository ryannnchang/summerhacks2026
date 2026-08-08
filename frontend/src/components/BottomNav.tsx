import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'RANKED' },
  { to: '/map', label: 'MAP' },
  { to: '/profile', label: 'PROFILE' },
]

export function BottomNav() {
  return (
    // h-14 is load-bearing: MapPage sizes itself against it with bottom-14.
    <nav className="fixed bottom-0 left-0 right-0 z-30 h-14 bg-turf-800 border-t-2 border-scoreboard/40">
      <div className="max-w-md mx-auto h-full flex items-stretch">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              `flex-1 py-3 text-center font-mono text-xs tracking-widest transition-colors ${
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
