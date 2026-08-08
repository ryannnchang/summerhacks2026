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

  // The judge's output, reassembled as the JSON it came from.
  const verdictJson = JSON.stringify(
    {
      verdict: submission.status,
      source: submission.verdict_source,
      ...(submission.reject_reason ? { reason: submission.reject_reason } : {}),
      coverage: submission.grass_coverage,
      texture: submission.texture_score,
      ...(submission.lushness !== null ? { lushness: submission.lushness } : {}),
      ...(submission.biodiversity !== null ? { biodiversity: submission.biodiversity } : {}),
      ...(submission.palette ? { palette: submission.palette } : {}),
      ...(submission.features ? { features: submission.features } : {}),
      quality: submission.quality_score,
    },
    null,
    1,
  )

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

          {/* The judge's raw JSON, stamped on the photo like a lab report. */}
          <pre className="absolute top-3 left-3 max-w-[60%] max-h-[55%] overflow-auto bg-turf-900/80 text-turf-400 font-mono text-[9px] leading-snug rounded-lg p-2">
            {verdictJson}
          </pre>

          {/* The tuft this photo became on the map. Server-generated SVG, safe to inject. */}
          {verified && submission.glyph_svg && (
            <div className="absolute bottom-3 left-3 flex items-end gap-2">
              <div
                className="w-14 h-14 grass-glyph bg-turf-900/70 rounded-xl p-1"
                dangerouslySetInnerHTML={{ __html: submission.glyph_svg }}
              />
              <p className="font-mono text-[10px] text-chalk bg-turf-900/70 px-2 py-1 rounded-full mb-1">
                your patch, on the map
              </p>
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col items-center text-center gap-2">
          <p className="font-mono text-5xl font-bold text-scoreboard tabular-nums">
            {submission.total_score.toFixed(0)}
          </p>
          {submission.elo_delta != null && submission.elo_delta !== 0 && (
            <p
              className={`font-mono text-sm font-bold tabular-nums ${
                submission.elo_delta > 0 ? 'text-turf-400' : 'text-dirt-light'
              }`}
            >
              {submission.elo_delta > 0 ? '+' : ''}
              {submission.elo_delta} ELO
            </p>
          )}
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

          {/* The judge's raw signals — present when Gemini graded the photo. */}
          {(submission.lushness !== null || submission.biodiversity !== null) && (
            <dl className="grid grid-cols-2 gap-3 w-full mt-3 pt-3 border-t border-chalk/10 text-center">
              {submission.lushness !== null && (
                <Stat label="LUSHNESS" value={submission.lushness.toFixed(0)} />
              )}
              {submission.biodiversity !== null && (
                <Stat label="BIODIVERSITY" value={submission.biodiversity.toFixed(0)} />
              )}
            </dl>
          )}

          {submission.palette && submission.palette.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-chalk/50 text-[10px] font-mono tracking-wide">PALETTE</span>
              {submission.palette.map((color) => (
                <span
                  key={color}
                  title={color}
                  className="w-5 h-5 rounded-full border border-chalk/20"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col w-full gap-2.5">
        {/* One submission per drop — win or lose, the only way out is forward. */}
        <button
          onClick={() => navigate('/')}
          className="w-full bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-xl tracking-wide py-3 rounded-xl transition-colors"
        >
          BACK TO RANKINGS
        </button>
      </div>
    </div>
  )
}
