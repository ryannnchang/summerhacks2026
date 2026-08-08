import { Link } from 'react-router-dom'

import { useCountdown } from '../hooks/useCountdown'
import type { Drop } from '../types'
import { ScoreboardTimer } from './ScoreboardTimer'

interface Props {
  drop: Drop | null
  onTrigger?: () => void
  /** Closes the live drop and fires a fresh one — resets everyone's timer. Demo tool. */
  onReset?: () => void
  triggering?: boolean
  /** Signed-out view: show the clock, but no camera link and no trigger. */
  readOnly?: boolean
}

/**
 * The live/not-live band under the title. The drop is global, so this is the same
 * clock for everyone — and when it's open, the only route into the camera.
 */
export function DropStatus({ drop, onTrigger, onReset, triggering, readOnly }: Props) {
  const remaining = useCountdown(drop?.status === 'active' ? drop.expires_at : null)
  const live = drop?.status === 'active'

  // Sits under the live card. Closing + refiring the drop resets the clock and
  // lets everyone submit again — the demo escape hatch.
  const resetRow =
    !readOnly && onReset && live ? (
      <button
        onClick={onReset}
        disabled={triggering}
        className="w-full mt-2 text-chalk/40 hover:text-chalk/80 disabled:opacity-50 font-mono text-[10px] tracking-widest py-1.5 transition-colors"
      >
        {triggering ? 'RESETTING…' : '↻ RESET DROP (demo)'}
      </button>
    ) : null

  if (live && drop && !drop.has_submitted) {
    const body = (
      <>
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-turf-900 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-turf-900" />
          </span>
          <p className="font-display text-2xl tracking-wide leading-none">
            TOUCH GRASS DROP IS LIVE
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <ScoreboardTimer seconds={remaining} />
          {!readOnly && (
            <span className="font-display text-xl tracking-wide underline underline-offset-4">
              OPEN CAMERA →
            </span>
          )}
        </div>
      </>
    )

    const skin = 'block w-full text-left bg-scoreboard text-turf-900 rounded-2xl chalk-border-solid p-5 shadow-lg'
    return (
      <div>
        {readOnly ? (
          <div className={skin}>{body}</div>
        ) : (
          <Link to="/capture" className={`${skin} active:scale-[0.98] transition-transform`}>
            {body}
          </Link>
        )}
        {resetRow}
      </div>
    )
  }

  if (live && drop?.has_submitted) {
    return (
      <div>
        <div className="bg-turf-800/70 chalk-border rounded-2xl p-5">
          <p className="font-display text-2xl tracking-wide text-turf-400 leading-none mb-1">
            YOU'RE IN THIS DROP
          </p>
          <p className="text-chalk/60 text-sm">
            Submitted. The window closes in {remaining === null ? '—' : formatShort(remaining)}.
          </p>
        </div>
        {resetRow}
      </div>
    )
  }

  return (
    <div className="bg-turf-800/50 chalk-border rounded-2xl p-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-display text-2xl tracking-wide text-chalk/50 leading-none mb-1">
          NO DROP LIVE
        </p>
        <p className="text-chalk/50 text-sm">
          {drop
            ? `Next one around ${new Date(drop.scheduled_for).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}. Keep your phone on.`
            : 'Nothing scheduled yet.'}
        </p>
      </div>
      {!readOnly && onTrigger && (
        <button
          onClick={onTrigger}
          disabled={triggering}
          className="flex-shrink-0 border border-chalk/20 text-chalk/70 hover:text-chalk hover:border-chalk/40 disabled:opacity-50 font-mono text-[10px] tracking-widest px-3 py-2 rounded-lg transition-colors"
        >
          {triggering ? 'DROPPING…' : 'DROP NOW'}
        </button>
      )}
    </div>
  )
}

function formatShort(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return m > 0 ? `${m}m` : `${seconds}s`
}
