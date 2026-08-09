/**
 * Elo rank tiers.
 *
 * `BASE_RATING` in backend/app/services/elo.py is 1200, and `Player.elo` defaults to it, so
 * "average" is the rating you hold before any drop has moved you — an exact value rather than a
 * band. Everything else is a range around it.
 *
 *   ≤ 500        stinky
 *   500 – 1000   horrible
 *   1000 – 1200  suboptimal
 *   1200         average      ← base
 *   1200 – 1400  good
 *   1400 – 1600  great
 *   1600 – 2000  goat
 *   > 2000       chad
 */

export const BASE_RATING = 1200

export interface EloTier {
  name: string
  symbol: string
  /** Tailwind text colour, so the symbol reads at a glance without a legend. */
  className: string
}

const STINKY: EloTier = { name: 'Stinky', symbol: '💩', className: 'text-dirt-light' }
const HORRIBLE: EloTier = { name: 'Horrible', symbol: '🥀', className: 'text-dirt-light' }
const SUBOPTIMAL: EloTier = { name: 'Suboptimal', symbol: '🌱', className: 'text-chalk/50' }
const AVERAGE: EloTier = { name: 'Average', symbol: '🌿', className: 'text-chalk/70' }
const GOOD: EloTier = { name: 'Good', symbol: '🍀', className: 'text-turf-400' }
const GREAT: EloTier = { name: 'Great', symbol: '🌳', className: 'text-turf-400' }
const GOAT: EloTier = { name: 'Goat', symbol: '🐐', className: 'text-scoreboard' }
const CHAD: EloTier = { name: 'Chad', symbol: '🗿', className: 'text-scoreboard' }

/** Accounts with no linked player row have no rating at all — not a bad one. */
const UNRANKED: EloTier = { name: 'Unranked', symbol: '·', className: 'text-chalk/30' }

/** Highest first, so the ladder reads top-down and the boundaries stay obvious. */
export const ELO_TIERS: readonly EloTier[] = [
  CHAD,
  GOAT,
  GREAT,
  GOOD,
  AVERAGE,
  SUBOPTIMAL,
  HORRIBLE,
  STINKY,
]

export function eloTier(elo: number | null | undefined): EloTier {
  if (elo == null) return UNRANKED
  if (elo > 2000) return CHAD
  if (elo > 1600) return GOAT
  if (elo > 1400) return GREAT
  if (elo > BASE_RATING) return GOOD
  if (elo === BASE_RATING) return AVERAGE
  if (elo >= 1000) return SUBOPTIMAL
  if (elo > 500) return HORRIBLE
  return STINKY
}
