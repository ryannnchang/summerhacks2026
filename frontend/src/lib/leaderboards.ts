import type { LeaderboardEntry } from '../types'

/** One row of the board. `streak: null` means the source carries no streak data. */
export interface BoardRow {
  rank: number
  username: string
  label: string
  elo: number
  total_score: number
  submissions: number
  streak: number | null
}

/**
 * The API ranks and orders already — both scopes come from the same query, so
 * this is a straight shape conversion rather than a merge.
 */
export function toBoardRows(entries: LeaderboardEntry[]): BoardRow[] {
  return entries.map((entry) => ({
    rank: entry.rank,
    username: entry.username,
    label: entry.display_name,
    elo: entry.elo,
    total_score: entry.total_score,
    submissions: entry.submissions,
    streak: entry.streak,
  }))
}
