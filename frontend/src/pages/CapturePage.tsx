import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { CameraCapture } from '../components/CameraCapture'
import { formatDuration, useCountdown } from '../hooks/useCountdown'
import { setPendingPhoto } from '../lib/pendingPhoto'
import type { Drop } from '../types'

export function CapturePage() {
  const navigate = useNavigate()

  const [drop, setDrop] = useState<Drop | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const remaining = useCountdown(drop?.status === 'active' ? drop.expires_at : null)

  useEffect(() => {
    api
      .currentDrop()
      .then(setDrop)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function handleCapture(file: File) {
    if (!drop) return
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file), dropId: drop.id })
    navigate('/review')
  }

  const open = drop?.status === 'active' && !drop.has_submitted

  return (
    <main className="min-h-screen flex flex-col px-5 pt-8 pb-24">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/')}
          className="text-chalk/60 hover:text-chalk text-sm font-mono w-12 text-left"
        >
          ← BACK
        </button>
        <h1 className="font-display text-2xl tracking-wide text-chalk">TOUCH GRASS</h1>
        <span className="w-12" />
      </div>

      {open ? (
        <>
          <p className="text-chalk/60 text-sm text-center mb-1 max-w-xs mx-auto">
            Frame some actual grass, dirt, or greenery. Our verifier is picky.
          </p>
          <p className="font-mono text-scoreboard text-sm text-center mb-5 tabular-nums">
            {remaining === null ? '' : `${formatDuration(remaining)} left`}
          </p>

          <div className="flex-1 flex items-start justify-center">
            <CameraCapture onCapture={handleCapture} />
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-4">
          {loading ? (
            <>
              <div className="w-8 h-8 border-2 border-scoreboard border-t-transparent rounded-full animate-spin" />
              <p className="font-mono text-chalk/50 text-sm">checking the clock…</p>
            </>
          ) : (
            <>
              <p className="font-display text-3xl tracking-wide text-chalk">
                {drop?.has_submitted ? 'ALREADY SUBMITTED' : 'NO DROP RUNNING'}
              </p>
              <p className="text-chalk/60 text-sm max-w-xs">
                {drop?.has_submitted
                  ? 'You logged this one. Sit tight for the next drop.'
                  : 'Photos only count during a live drop. Start one from the rankings page.'}
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-xl tracking-wide px-6 py-2.5 rounded-xl transition-colors"
              >
                BACK TO RANKINGS
              </button>
            </>
          )}
          {error && (
            <p className="text-dirt-light text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </main>
  )
}
