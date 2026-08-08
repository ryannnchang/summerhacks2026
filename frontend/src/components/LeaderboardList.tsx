import type { BoardRow } from '../lib/leaderboards'
import { Avatar } from './Avatar'

function Streak({ streak }: { streak: number | null }) {
  // null means the source has no streak data (the global board), so show nothing
  // rather than implying everyone is on zero.
  if (streak === null) return null
  if (streak === 0) return <span className="text-chalk/30 text-xs font-mono">cold</span>
  return <span className="text-scoreboard font-mono text-xs">🔥 {streak}</span>
}

interface Props {
  rows: BoardRow[]
  currentUsername?: string
  emptyMessage?: string
}

export function LeaderboardList({ rows, currentUsername, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-chalk/50 text-sm chalk-border rounded-xl p-4 text-center">
        {emptyMessage ?? 'Nobody has touched grass yet. Be the first.'}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {rows.map((row) => {
        const isYou = row.username === currentUsername
        return (
          <li
            key={row.username}
            className={`flex items-center gap-3 rounded-xl p-3 chalk-border ${
              isYou ? 'bg-scoreboard/10 border-scoreboard/50' : 'bg-turf-800/70'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center font-display text-lg flex-shrink-0 ${
                row.rank === 1 ? 'bg-scoreboard text-turf-900' : 'bg-turf-700 text-chalk/70'
              }`}
            >
              {row.rank}
            </span>

            <Avatar name={row.label.replace(/^@/, '')} />

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-chalk text-sm truncate">
                {row.label}
                {isYou && <span className="text-scoreboard text-xs ml-1.5 font-mono">(you)</span>}
              </p>
              <div className="flex items-center gap-2">
                <Streak streak={row.streak} />
                <span className="text-chalk/40 text-[10px] font-mono">
                  {Math.round(row.total_score).toLocaleString()} pts · {row.submissions} drop
                  {row.submissions === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Elo decides the rank, so it gets the big number. */}
            <div className="text-right flex-shrink-0">
              <p className="font-mono text-scoreboard font-bold text-base tabular-nums leading-none">
                {row.elo}
              </p>
              <p className="text-chalk/40 text-[9px] font-mono mt-0.5">
                {row.submissions < 10 ? 'PROVISIONAL' : 'ELO'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
