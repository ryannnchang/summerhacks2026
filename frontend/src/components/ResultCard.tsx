import { useNavigate } from 'react-router-dom'

import type { Submission } from '../types'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-chalk/50 text-[10px] font-mono tracking-wide">{label}</dt>
      <dd className="font-mono text-chalk font-bold text-base tabular-nums mt-0.5">{value}</dd>
    </div>
  )
}

interface Props {
  submission: Submission
  previewUrl: string
}

export function ResultCard({ submission, previewUrl }: Props) {
  const navigate = useNavigate()
  const verified = submission.status === 'verified'

  return (
    <div className="animate-popin w-full flex flex-col items-center gap-5">
      <div className="w-full rounded-2xl overflow-hidden chalk-border-solid bg-turf-800">
        <div className="relative aspect-[3/4] w-full">
          <img src={previewUrl} alt="Your submission" className="w-full h-full object-cover" />
          <div
            className={`absolute top-3 right-3 px-3 py-1 rounded-full font-display text-sm tracking-wide ${
              verified ? 'bg-turf-500 text-turf-900' : 'bg-dirt text-chalk'
            }`}
          >
            {verified ? 'VERIFIED' : 'REJECTED'}
          </div>
        </div>

        <div className="p-5 flex flex-col items-center text-center gap-2">
          <p className="font-mono text-5xl font-bold text-scoreboard tabular-nums">
            {submission.total_score.toFixed(0)}
          </p>
          <p className="text-chalk/70 text-sm max-w-xs">
            {verified
              ? 'Real grass, real sunlight. Points awarded.'
              : (submission.reject_reason ?? 'No grass detected in frame.')}
          </p>

          {verified && (
            <dl className="grid grid-cols-4 gap-3 w-full mt-3 pt-3 border-t border-chalk/10 text-center">
              <Stat label="QUALITY" value={submission.quality_score.toFixed(0)} />
              <Stat label="SPEED" value={submission.speed_score.toFixed(0)} />
              <Stat label="COVER" value={`${(submission.grass_coverage * 100).toFixed(0)}%`} />
              <Stat label="TIME" value={`${submission.response_seconds.toFixed(0)}s`} />
            </dl>
          )}
        </div>
      </div>

      <div className="flex flex-col w-full gap-2.5">
        {!verified && (
          <button
            onClick={() => navigate('/capture')}
            className="w-full bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-xl tracking-wide py-3 rounded-xl transition-colors"
          >
            TRY AGAIN
          </button>
        )}
        <button
          onClick={() => navigate('/')}
          className={`w-full font-display text-xl tracking-wide py-3 rounded-xl transition-colors ${
            verified
              ? 'bg-scoreboard hover:bg-scoreboard-dim text-turf-900'
              : 'border border-chalk/20 text-chalk/70 hover:text-chalk'
          }`}
        >
          BACK TO RANKINGS
        </button>
      </div>
    </div>
  )
}
