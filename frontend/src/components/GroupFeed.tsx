import { timeAgo } from '../lib/format'
import type { Submission } from '../types'

function StatusPill({ status }: { status: Submission['status'] }) {
  const verified = status === 'verified'
  return (
    <span
      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ${
        verified
          ? 'border-turf-400 text-turf-400 bg-turf-500/10'
          : 'border-dirt-light text-dirt-light bg-dirt/20'
      }`}
    >
      {verified ? 'VERIFIED' : 'NO GRASS'}
    </span>
  )
}

interface Props {
  submissions: Submission[]
  live: boolean
}

export function GroupFeed({ submissions, live }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-2xl tracking-wide text-chalk">GROUP FEED</h2>
        <span className="text-xs font-mono text-chalk/50">
          {live ? 'LIVE' : 'RECONNECTING…'}
        </span>
      </div>

      {submissions.length === 0 ? (
        <p className="text-chalk/50 text-sm chalk-border rounded-xl p-4 text-center">
          Nobody has touched grass yet. Be the first.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {submissions.map((item) => {
            const name = item.username ?? 'someone'
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 bg-turf-800/70 chalk-border rounded-xl p-3"
              >
                <img
                  src={item.thumbnail_url}
                  alt={`Grass by ${name}`}
                  loading="lazy"
                  className={`w-11 h-11 rounded-lg object-cover flex-shrink-0 bg-turf-700 ${
                    item.status === 'rejected' ? 'grayscale opacity-60' : ''
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-chalk text-sm truncate">@{name}</p>
                    <StatusPill status={item.status} />
                  </div>
                  <p className="text-chalk/60 text-xs truncate mt-0.5">
                    {item.status === 'verified'
                      ? `${(item.grass_coverage * 100).toFixed(0)}% coverage · ${item.response_seconds.toFixed(0)}s response`
                      : (item.reject_reason ?? 'Rejected')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-scoreboard font-bold text-sm">
                    {item.total_score.toFixed(0)}
                  </p>
                  <p className="text-chalk/40 text-[10px]">{timeAgo(item.submitted_at)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
