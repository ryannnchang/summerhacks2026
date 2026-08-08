import { api } from '../api/client'
import type { LeaderboardEntry } from '../types'

/** One row of either board. `streak: null` means the source doesn't carry streaks. */
export interface BoardRow {
  rank: number
  username: string
  /** Display name where the source has one, otherwise the username. */
  label: string
  total_score: number
  submissions: number
  streak: number | null
}

function ranked(rows: Omit<BoardRow, 'rank'>[]): BoardRow[] {
  return [...rows]
    .sort((a, b) => b.total_score - a.total_score || a.username.localeCompare(b.username))
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

/**
 * Global board, built from the public mural.
 *
 * `GET /mural` returns every verified submission from every group with a username and
 * a score attached, and needs no auth — so this works signed out, which the group
 * leaderboard endpoint cannot. Two things are lost in the trade:
 *   - no streaks, since a mural tile doesn't carry one (hence `streak: null`)
 *   - no display names, so rows show @username
 *
 * The endpoint caps at 2000 tiles. `tile_count` reports the true total, so anything
 * beyond that is missing from the ranking — fine at hackathon scale, worth revisiting
 * if the mural ever gets big.
 */
export async function globalLeaderboard(): Promise<BoardRow[]> {
  const mural = await api.mural(2000)

  const totals = new Map<string, { total_score: number; submissions: number }>()
  for (const tile of mural.tiles) {
    const seen = totals.get(tile.username)
    if (seen) {
      seen.total_score += tile.total_score
      seen.submissions += 1
    } else {
      totals.set(tile.username, { total_score: tile.total_score, submissions: 1 })
    }
  }

  return ranked(
    [...totals.entries()].map(([username, sums]) => ({
      username,
      label: `@${username}`,
      streak: null,
      ...sums,
    })),
  )
}

/** Friends board: the active group's leaderboard, which does carry streaks. */
export function toBoardRows(entries: LeaderboardEntry[]): BoardRow[] {
  return ranked(
    entries.map((entry) => ({
      username: entry.username,
      label: entry.display_name,
      total_score: entry.total_score,
      submissions: entry.submissions,
      streak: entry.streak,
    })),
  )
}
