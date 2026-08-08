import type { LeaderboardEntry } from '../types'

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[]
  currentUserId?: number
}) {
  if (entries.length === 0) {
    return <p className="card__hint">Nobody has touched grass yet. Be the first.</p>
  }

  return (
    <ol className="leaderboard">
      {entries.map((entry) => (
        <li
          key={entry.user_id}
          className={`leaderboard__row${entry.user_id === currentUserId ? ' is-you' : ''}`}
        >
          <span className="leaderboard__rank">{MEDALS[entry.rank - 1] ?? entry.rank}</span>
          <span className="leaderboard__name">
            {entry.display_name}
            {entry.streak > 1 && <span className="streak">🔥{entry.streak}</span>}
          </span>
          <span className="leaderboard__meta">{entry.submissions} drops</span>
          <span className="leaderboard__score">{entry.total_score.toFixed(0)}</span>
        </li>
      ))}
    </ol>
  )
}
