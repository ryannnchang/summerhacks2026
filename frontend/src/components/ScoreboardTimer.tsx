function Digit({ value }: { value: string }) {
  return (
    <div className="flip-digit w-9 h-12 sm:w-11 sm:h-14 flex items-center justify-center">
      <span className="font-mono text-2xl sm:text-3xl font-bold text-scoreboard tabular-nums">
        {value}
      </span>
    </div>
  )
}

/**
 * Purely presentational, unlike the design mock which ran its own `setTimeout`.
 * Real drop deadlines come from the server, so `useCountdown(drop.expires_at)`
 * owns the ticking and this just renders whatever second it's on.
 */
export function ScoreboardTimer({ seconds }: { seconds: number | null }) {
  const safe = Math.max(0, seconds ?? 0)
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0')
  const ss = (safe % 60).toString().padStart(2, '0')
  const digits = seconds === null ? ['-', '-', '-', '-'] : [mm[0], mm[1], ss[0], ss[1]]

  return (
    <div
      className="flex items-center gap-1.5"
      role="timer"
      aria-label={seconds === null ? 'No deadline' : `${mm} minutes ${ss} seconds remaining`}
    >
      <Digit value={digits[0]} />
      <Digit value={digits[1]} />
      <span className="text-scoreboard font-mono text-2xl font-bold px-0.5">:</span>
      <Digit value={digits[2]} />
      <Digit value={digits[3]} />
    </div>
  )
}
