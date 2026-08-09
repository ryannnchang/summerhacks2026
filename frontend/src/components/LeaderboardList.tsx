import { eloTier } from '../lib/eloTiers'
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

/** Pedestal styling per place — lusher green the higher you stand. */
const PODIUM = [
  { block: 'bg-turf-400 h-28', number: 'text-turf-900', label: '1st' },
  { block: 'bg-turf-500 h-20', number: 'text-turf-900', label: '2nd' },
  { block: 'bg-turf-600 h-14', number: 'text-chalk/90', label: '3rd' },
] as const

function Podium({ rows, currentUsername }: { rows: BoardRow[]; currentUsername?: string }) {
  // Rendered 2nd | 1st | 3rd, so the winner stands centre and tallest.
  const order = [rows[1], rows[0], rows[2]].filter((r): r is BoardRow => Boolean(r))

  return (
    <ol className="flex items-end justify-center gap-2 mb-4">
      {order.map((row) => {
        const style = PODIUM[row.rank - 1]
        const isYou = row.username === currentUsername
        return (
          <li key={row.username} className="flex-1 max-w-[8.5rem] flex flex-col items-center">
            <span className={`mb-1 text-xl leading-none ${eloTier(row.elo).className}`}>
              {eloTier(row.elo).symbol}
            </span>
            <Avatar name={row.label.replace(/^@/, '')} />
            <p
              className={`mt-1 mb-1.5 text-xs font-semibold truncate max-w-full ${
                isYou ? 'text-scoreboard' : 'text-chalk'
              }`}
            >
              {row.label}
            </p>
            <div
              className={`w-full rounded-t-xl flex flex-col items-center justify-start pt-2 ${style.block} ${
                isYou ? 'ring-2 ring-scoreboard' : ''
              }`}
            >
              <span className={`font-display text-2xl leading-none ${style.number}`}>
                {row.rank}
              </span>
              <span className={`font-mono text-[10px] tabular-nums ${style.number} opacity-80`}>
                {row.elo}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function LeaderboardList({ rows, currentUsername, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-chalk/50 text-sm chalk-border rounded-xl p-4 text-center">
        {emptyMessage ?? 'Nobody has touched grass yet. Be the first.'}
      </p>
    )
  }

  // With two players there is no podium, just a winner — the flat list reads
  // better than a lonely pair of pedestals.
  const podium = rows.length >= 3 ? rows.slice(0, 3) : []
  const listed = rows.length >= 3 ? rows.slice(3) : rows

  return (
    <div>
      {podium.length > 0 && <Podium rows={podium} currentUsername={currentUsername} />}
      <ol className="flex flex-col gap-2">
        {listed.map((row) => {
        const isYou = row.username === currentUsername
        return (
          <li
            key={row.username}
            // Your row is solid like every other; the gold border marks it.
            // A gold *tint* washed out the gold "(you)" sitting on top of it.
            className={`flex items-center gap-3 rounded-xl p-3 chalk-border ${
              isYou ? 'bg-turf-800 border-scoreboard' : 'bg-turf-800'
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

            {/* Elo decides the rank, so it gets the big number; the tier symbol sits beside it
                so the ladder is readable without doing arithmetic on four-digit ratings. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`text-lg leading-none ${eloTier(row.elo).className}`}
                // Under 10 drops the rating hasn't settled, which the tier name alone doesn't
                // convey — so it survives here rather than replacing the tier outright.
                title={
                  `${eloTier(row.elo).name} (${row.elo})` +
                  (row.submissions < 10 ? ' · provisional, under 10 drops' : '')
                }
                aria-label={eloTier(row.elo).name}
              >
                {eloTier(row.elo).symbol}
              </span>
              <div className="text-right">
                <p className="font-mono text-scoreboard font-bold text-base tabular-nums leading-none">
                  {row.elo}
                </p>
                <p className={`text-[9px] font-mono mt-0.5 ${eloTier(row.elo).className}`}>
                  {eloTier(row.elo).name.toUpperCase()}
                </p>
              </div>
            </div>
          </li>
        )
      })}
      </ol>
    </div>
  )
}
