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
  /** Inclusive lower bound. -Infinity on the bottom tier. */
  from: number
  /** Inclusive upper bound. Infinity on the top tier. */
  to: number
}

// Bounds live on the tier objects rather than in eloTier()'s if-chain, because
// the ladder needs to *draw* the bands and a second copy of the thresholds would
// drift from the classifier the first time anyone retunes them.
const STINKY: EloTier = { name: 'Stinky', symbol: '💩', className: 'text-dirt-light', from: -Infinity, to: 500 } // prettier-ignore
const HORRIBLE: EloTier = { name: 'Horrible', symbol: '🥀', className: 'text-dirt-light', from: 501, to: 999 } // prettier-ignore
const SUBOPTIMAL: EloTier = { name: 'Suboptimal', symbol: '🌱', className: 'text-chalk/50', from: 1000, to: 1199 } // prettier-ignore
const AVERAGE: EloTier = { name: 'Average', symbol: '🌿', className: 'text-chalk/70', from: 1200, to: 1200 } // prettier-ignore
const GOOD: EloTier = { name: 'Good', symbol: '🍀', className: 'text-turf-400', from: 1201, to: 1400 } // prettier-ignore
const GREAT: EloTier = { name: 'Great', symbol: '🌳', className: 'text-turf-400', from: 1401, to: 1600 } // prettier-ignore
const GOAT: EloTier = { name: 'Goat', symbol: '🐐', className: 'text-scoreboard', from: 1601, to: 2000 } // prettier-ignore
const CHAD: EloTier = { name: 'Chad', symbol: '🗿', className: 'text-scoreboard', from: 2001, to: Infinity } // prettier-ignore

/** Accounts with no linked player row have no rating at all — not a bad one. */
const UNRANKED: EloTier = {
  name: 'Unranked',
  symbol: '·',
  className: 'text-chalk/30',
  from: NaN,
  to: NaN,
}

/** Lowest first — the order the horizontal ladder draws in, worst on the left. */
export const ELO_LADDER: readonly EloTier[] = [
  STINKY,
  HORRIBLE,
  SUBOPTIMAL,
  AVERAGE,
  GOOD,
  GREAT,
  GOAT,
  CHAD,
]

/** Highest first, so the ladder reads top-down and the boundaries stay obvious. */
export const ELO_TIERS: readonly EloTier[] = [...ELO_LADDER].reverse()

export function eloTier(elo: number | null | undefined): EloTier {
  if (elo == null) return UNRANKED
  // First band whose ceiling the rating hasn't cleared. Ratings are integers
  // (Player.elo is an int column), but scanning by ceiling rather than by
  // [from, to] containment keeps a fractional value from falling through the
  // one-point Average band into nothing.
  return ELO_LADDER.find((tier) => elo <= tier.to) ?? CHAD
}

// Open-ended bands need a finite edge to draw a pointer inside. Stinky bottoms
// out at 0 and Chad is given the same 400-point run as Goat above it.
const FLOOR = 0
const CEILING = 2400

/**
 * Where a rating sits along the whole ladder, 0 (far left) to 1 (far right).
 *
 * Bands are drawn equal-width rather than to scale: Average is a single rating
 * and Chad is unbounded, so a true Elo axis would collapse one to nothing and
 * stretch the other forever. The pointer still moves *within* its band, so a
 * rating climbing through Good visibly advances.
 */
export function ladderPosition(elo: number | null | undefined): number | null {
  if (elo == null) return null
  const tier = eloTier(elo)
  const index = ELO_LADDER.indexOf(tier)
  if (index < 0) return null

  const from = Number.isFinite(tier.from) ? tier.from : FLOOR
  const to = Number.isFinite(tier.to) ? tier.to : CEILING
  // A one-rating band (Average) has nowhere to slide — sit dead centre.
  const within = to === from ? 0.5 : Math.min(1, Math.max(0, (elo - from) / (to - from)))
  return (index + within) / ELO_LADDER.length
}

/** "1201–1400", "2001+", "≤500" — the band, as a player reads it. */
export function tierRangeLabel(tier: EloTier): string {
  if (!Number.isFinite(tier.from)) return `≤${tier.to}`
  if (!Number.isFinite(tier.to)) return `${tier.from}+`
  if (tier.from === tier.to) return `${tier.from}`
  return `${tier.from}–${tier.to}`
}
