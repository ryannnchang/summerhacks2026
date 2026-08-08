import { useNavigate } from 'react-router-dom'

import { useCountdown } from '../hooks/useCountdown'
import type { Drop } from '../types'
import { ScoreboardTimer } from './ScoreboardTimer'

interface Props {
  drop: Drop
  onDismiss: () => void
}

export function LiveDropBanner({ drop, onDismiss }: Props) {
  const navigate = useNavigate()
  const remaining = useCountdown(drop.expires_at)

  return (
    <div
      role="alertdialog"
      aria-label="Live drop alert"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="animate-popin w-full sm:max-w-sm bg-turf-800 chalk-border-solid rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-scoreboard text-turf-900 px-4 py-2 flex items-center justify-between">
          <span className="font-display text-xl tracking-wide">LIVE DROP</span>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-turf-900 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-turf-900" />
          </span>
        </div>

        <div className="p-5 flex flex-col items-center text-center gap-4">
          <p className="text-chalk/90 text-sm leading-relaxed">
            Every phone in your group just buzzed. Whoever touches grass first gets bonus points
            before the window closes.
          </p>

          <ScoreboardTimer seconds={remaining} />

          <div className="flex flex-col w-full gap-2 mt-1">
            <button
              onClick={() => {
                onDismiss()
                navigate('/capture')
              }}
              className="w-full bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-lg tracking-wide py-2.5 rounded-xl transition-colors"
            >
              GO TOUCH GRASS
            </button>
            <button
              onClick={onDismiss}
              className="w-full text-chalk/60 text-sm py-1.5 hover:text-chalk transition-colors"
            >
              Not right now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
