import { formatDuration, useCountdown } from '../hooks/useCountdown'
import type { Drop } from '../types'

interface Props {
  drop: Drop | null
  onTrigger: () => void
  triggering: boolean
}

export function DropBanner({ drop, onTrigger, triggering }: Props) {
  const remaining = useCountdown(drop?.status === 'active' ? drop.expires_at : null)

  if (!drop) {
    return <div className="drop-banner drop-banner--idle">No drops scheduled yet.</div>
  }

  if (drop.status === 'active') {
    return (
      <div className="drop-banner drop-banner--live">
        <div className="drop-banner__pulse" aria-hidden />
        <div>
          <p className="drop-banner__label">Drop is live — go outside</p>
          <p className="drop-banner__timer">{remaining === null ? '—' : formatDuration(remaining)}</p>
        </div>
        {drop.has_submitted && <span className="badge badge--done">Submitted ✓</span>}
      </div>
    )
  }

  const when = new Date(drop.scheduled_for)
  return (
    <div className="drop-banner drop-banner--idle">
      <div>
        <p className="drop-banner__label">Next drop</p>
        <p className="drop-banner__sub">
          Sometime around{' '}
          {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Keep your phone on.
        </p>
      </div>
      <button className="button button--ghost" onClick={onTrigger} disabled={triggering}>
        {triggering ? 'Dropping…' : 'Drop now'}
      </button>
    </div>
  )
}
