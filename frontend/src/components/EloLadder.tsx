import { ELO_LADDER, eloTier, ladderPosition, tierRangeLabel } from '../lib/eloTiers'

/**
 * The whole rank ladder on one horizontal scale, worst on the left, with a
 * pointer on where the player currently stands.
 *
 * Bands are equal-width rather than to scale — see `ladderPosition`. Segment
 * colour comes from each tier's existing Tailwind text class via `bg-current`,
 * so the ladder can never disagree with the colour the rank badge uses.
 */
export function EloLadder({ elo }: { elo: number | null | undefined }) {
  const current = eloTier(elo)
  const position = ladderPosition(elo)
  const ranked = position !== null

  return (
    <div className="rounded-xl bg-turf-800/70 chalk-border p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-mono text-chalk/50 text-[10px] tracking-[0.2em]">ALL RANKS</h3>
        <p className="font-mono text-chalk/30 text-[9px] tracking-wider">ELO →</p>
      </div>

      {/* Pointer track. Reserved height even when unranked, so toggling the
          panel open doesn't shift the rows below by a few pixels. */}
      <div className="relative h-6">
        {ranked && (
          <div
            className="absolute bottom-0 flex flex-col items-center -translate-x-1/2 transition-[left] duration-500"
            style={{ left: `${position * 100}%` }}
          >
            <span className="font-mono text-[9px] font-bold text-scoreboard tabular-nums whitespace-nowrap leading-none">
              YOU {elo}
            </span>
            {/* Triangle, drawn with borders so it needs no asset. */}
            <span className="mt-0.5 w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-scoreboard" />
          </div>
        )}
      </div>

      {/* The scale itself. */}
      <div className="flex gap-0.5" role="img" aria-label={ladderLabel(elo)}>
        {ELO_LADDER.map((tier) => {
          const here = ranked && tier.name === current.name
          return (
            <div
              key={tier.name}
              className="group relative flex-1 min-w-0 flex flex-col items-center gap-1"
            >
              {/* Hover label. Pure desktop polish — there is no hover on a
                  phone, and the legend below already names every tier for
                  touch and screen readers, so it stays out of the a11y tree. */}
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md bg-turf-900 chalk-border px-2 py-1 group-hover:flex"
              >
                <span className={`font-mono text-[10px] font-bold leading-tight ${tier.className}`}>
                  {tier.name}
                </span>
                <span className="font-mono text-[9px] leading-tight text-chalk/40 tabular-nums">
                  {tierRangeLabel(tier)}
                </span>
              </span>

              <span
                className={`text-sm leading-none cursor-default transition-opacity ${
                  here ? '' : 'opacity-40 group-hover:opacity-100'
                }`}
                aria-hidden
              >
                {tier.symbol}
              </span>
              <span
                className={`w-full h-1.5 rounded-sm bg-current transition-opacity ${
                  tier.className
                } ${here ? 'opacity-100' : 'opacity-25 group-hover:opacity-70'}`}
              />
            </div>
          )
        })}
      </div>

      {/* Names and bands, wrapped under the scale. Eight labels never fit
          across a phone at a legible size, so the detail lives in a grid
          instead of being crammed into the segments. */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
        {[...ELO_LADDER].reverse().map((tier) => {
          const here = ranked && tier.name === current.name
          return (
            <div
              key={tier.name}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${
                here ? 'bg-scoreboard/15' : ''
              }`}
            >
              <span className="text-xs leading-none" aria-hidden>
                {tier.symbol}
              </span>
              <dt
                className={`font-mono text-[10px] truncate ${
                  here ? 'text-chalk font-bold' : 'text-chalk/50'
                }`}
              >
                {tier.name}
              </dt>
              <dd className="font-mono text-[9px] text-chalk/30 tabular-nums ml-auto">
                {tierRangeLabel(tier)}
              </dd>
            </div>
          )
        })}
      </dl>

      {!ranked && (
        <p className="text-chalk/40 text-[10px] font-mono mt-2 text-center">
          No rating yet — land a verified patch to take your place on the scale.
        </p>
      )}
    </div>
  )
}

function ladderLabel(elo: number | null | undefined): string {
  const tier = eloTier(elo)
  if (elo == null) return 'Rank ladder. You are unranked.'
  return `Rank ladder from Stinky to Chad. You are ${tier.name} at ${elo} Elo.`
}
