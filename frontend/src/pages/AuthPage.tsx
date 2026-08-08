import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useSession } from '../hooks/useSession'

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5 flex-shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

export function AuthPage() {
  const { signInWithGoogle, error } = useSession()
  const location = useLocation()
  const [busy, setBusy] = useState(false)

  // Set by RequireSession when it turns someone away from /capture.
  const state = location.state as { returnTo?: string } | null
  const returnTo = state?.returnTo

  async function handleSignIn() {
    setBusy(true)
    try {
      // On success the browser leaves for Google, so `busy` stays true until
      // it comes back. Only a failed handoff falls through to the reset below.
      await signInWithGoogle(returnTo)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mb-8 text-center">
          <p className="font-mono text-scoreboard text-xs tracking-[0.3em] mb-1">SEASON 01</p>
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide text-chalk leading-none">
            RANKED
            <br />
            GRASS
          </h1>
          <p className="text-chalk/60 text-sm mt-3">Go outside. Get verified. Beat your group.</p>
        </div>

        <div className="w-full flex flex-col gap-4 bg-turf-800/60 chalk-border rounded-2xl p-5">
          <button
            onClick={() => void handleSignIn()}
            disabled={busy}
            className="w-full bg-chalk hover:bg-white disabled:opacity-60 text-turf-900 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            <GoogleMark />
            {busy ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {error && (
            <p className="text-dirt-light text-sm" role="alert">
              {error}
            </p>
          )}

          <p className="text-chalk/40 text-xs text-center leading-relaxed">
            We use your Google name and email to build your player profile. Nothing is posted
            anywhere.
          </p>
        </div>
      </div>
    </main>
  )
}
