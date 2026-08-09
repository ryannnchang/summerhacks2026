import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { CameraCapture } from '../components/CameraCapture'
import { ParkCompass } from '../components/ParkCompass'
import { formatDuration, useCountdown } from '../hooks/useCountdown'
import { currentCoords, watchCoords } from '../lib/geo'
import type { Coords } from '../lib/geo'
import { setPendingPhoto } from '../lib/pendingPhoto'
import type { Drop } from '../types'

export function CapturePage() {
  const navigate = useNavigate()

  const [drop, setDrop] = useState<Drop | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // A snapped-but-not-yet-submitted photo; the confirm screen shows while set.
  const [shot, setShot] = useState<{ file: File; previewUrl: string } | null>(null)

  // Ask for location the moment the camera opens — both permission prompts
  // appear together, and the fix is usually resolved before the photo is taken.
  const coords = useMemo(() => currentCoords(), [])

  // Live position for the park compass: the first fix seeds it, then
  // watchPosition keeps it current so the distance counts down as you walk.
  // The photo still uploads with `coords` — one fix, resolved once.
  const [fix, setFix] = useState<Coords | undefined>()
  useEffect(() => {
    let cancelled = false
    void coords.then((value) => {
      if (!cancelled && value) setFix((current) => current ?? value)
    })
    const stop = watchCoords((value) => {
      if (!cancelled) setFix(value)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [coords])

  const remaining = useCountdown(drop?.status === 'active' ? drop.expires_at : null)

  useEffect(() => {
    api
      .currentDrop()
      .then(setDrop)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function handleCapture(file: File) {
    setShot({ file, previewUrl: URL.createObjectURL(file) })
  }

  function handleRetake() {
    if (shot) URL.revokeObjectURL(shot.previewUrl)
    setShot(null)
  }

  function handleSubmit() {
    if (!drop || !shot) return
    // The preview URL's lifetime transfers to pendingPhoto, which revokes it.
    setPendingPhoto({ file: shot.file, previewUrl: shot.previewUrl, dropId: drop.id, coords })
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
            {shot
              ? 'Happy with it? The verifier only gets one look.'
              : 'Frame some actual grass, dirt, or greenery. Our verifier is picky.'}
          </p>
          <p className="font-mono text-scoreboard text-sm text-center mb-5 tabular-nums">
            {remaining === null ? '' : `${formatDuration(remaining)} left`}
          </p>

          <div className="flex-1 flex items-start justify-center">
            {shot ? (
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden chalk-border-solid bg-turf-800">
                  <img
                    src={shot.previewUrl}
                    alt="Your photo, ready to submit"
                    className="w-full h-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-4 border-2 border-scoreboard/40 rounded-xl" />
                </div>

                <div className="flex flex-col w-full gap-2.5">
                  <button
                    onClick={handleSubmit}
                    className="w-full bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-2xl tracking-wide py-3 rounded-xl transition-colors"
                  >
                    SUBMIT PHOTO
                  </button>
                  <button
                    onClick={handleRetake}
                    className="w-full text-chalk/70 text-sm py-2 border border-chalk/20 rounded-xl hover:text-chalk hover:border-chalk/40 transition-colors"
                  >
                    Retake
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full">
                <CameraCapture onCapture={handleCapture} />
                <ParkCompass coords={fix} />
              </div>
            )}
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
