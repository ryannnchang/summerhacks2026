import type { LeaderboardEntry } from '../types'
import { Avatar } from './Avatar'

function StreakFlames({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-chalk/30 text-xs font-mono">cold</span>
  return <span className="flex items-center gap-1 text-scoreboard font-mono text-xs">🔥 {streak}</span>
}

interface Props {
  entries: LeaderboardEntry[]
  currentUserId?: number
}

export function LeaderboardList({ entries, currentUserId }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-chalk/50 text-sm chalk-border rounded-xl p-4 text-center">
        Nobody has touched grass yet. Be the first.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => {
        const isYou = entry.user_id === currentUserId
        return (
          <li
            key={entry.user_id}
            className={`flex items-center gap-3 rounded-xl p-3 chalk-border ${
              isYou ? 'bg-scoreboard/10 border-scoreboard/50' : 'bg-turf-800/70'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center font-display text-lg flex-shrink-0 ${
                entry.rank === 1 ? 'bg-scoreboard text-turf-900' : 'bg-turf-700 text-chalk/70'
              }`}
            >
              {entry.rank}
            </span>

            <Avatar name={entry.display_name} />

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-chalk text-sm truncate">
                {entry.display_name}
                {isYou && <span className="text-scoreboard text-xs ml-1.5 font-mono">(you)</span>}
              </p>
              <div className="flex items-center gap-2">
                <StreakFlames streak={entry.streak} />
                <span className="text-chalk/40 text-[10px] font-mono">
                  {entry.submissions} drop{entry.submissions === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <p className="font-mono text-scoreboard font-bold text-sm flex-shrink-0">
              {Math.round(entry.total_score).toLocaleString()}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
