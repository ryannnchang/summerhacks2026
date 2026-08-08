import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { ResultCard } from '../components/ResultCard'
import { currentCoords } from '../lib/geo'
import { getPendingPhoto, uploadPendingOnce } from '../lib/pendingPhoto'
import type { Submission } from '../types'

export function ReviewPage() {
  const pending = getPendingPhoto()
  const navigate = useNavigate()

  const [result, setResult] = useState<Submission | null>(pending?.result ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pending || pending.result) return

    // The upload itself is started at most once (module-level promise), so
    // StrictMode's double mount just subscribes twice — whichever mount is
    // still alive when it settles renders the verdict.
    let cancelled = false
    uploadPendingOnce(async () =>
      api.submitGrass(pending.dropId, pending.file, await currentCoords()),
    )
      .then((submission) => {
        if (!cancelled) setResult(submission)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Upload failed')
      })
    return () => {
      cancelled = true
    }
  }, [pending])

  // Nothing to review — a refresh dropped the in-memory photo, so go shoot another.
  if (!pending) return <Navigate to="/capture" replace />

  const verifying = !result && !error

  return (
    <main className="min-h-screen flex flex-col items-center px-5 pt-10 pb-24">
      <h1 className="font-display text-2xl tracking-wide text-chalk mb-6">
        {verifying ? 'VERIFYING' : 'RESULT'}
      </h1>

      <div className="w-full max-w-sm">
        {verifying && (
          <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden chalk-border-solid">
            <img
              src={pending.previewUrl}
              alt="Your submission, pending verification"
              className="w-full h-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-turf-900/30" />
            <div className="absolute left-0 right-0 h-1/4 bg-gradient-to-b from-transparent via-scoreboard/40 to-transparent animate-scanline" />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <p className="font-mono text-xs text-chalk bg-turf-900/70 px-3 py-1.5 rounded-full">
                scanning for grass…
              </p>
            </div>
          </div>
        )}

        {result && <ResultCard submission={result} previewUrl={pending.previewUrl} />}

        {error && (
          <div className="flex flex-col gap-3">
            <p
              className="text-dirt-light text-sm chalk-border rounded-xl p-4 text-center"
              role="alert"
            >
              {error}
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full border border-chalk/20 text-chalk/70 hover:text-chalk font-display text-xl tracking-wide py-3 rounded-xl transition-colors"
            >
              BACK TO RANKINGS
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
