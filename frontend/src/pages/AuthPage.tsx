import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { useSession } from '../hooks/useSession'

export function AuthPage() {
  const navigate = useNavigate()
  const { signIn, selectGroup } = useSession()

  const [username, setUsername] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = username.trim()
    const code = joinCode.trim().toUpperCase()

    if (!name) {
      setError('Pick a username to continue.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await signIn(name)

      // A code is optional: without one we drop the visitor on /groups to start
      // or pick a group, which is where the real API expects them anyway.
      if (code) {
        const group = await api.joinGroup(code)
        selectGroup(group.id)
        navigate('/dashboard')
      } else {
        navigate('/groups')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in')
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
            COMPETITIVE
            <br />
            GRASS
          </h1>
          <p className="text-chalk/60 text-sm mt-3">Go outside. Get verified. Beat your group.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-4 bg-turf-800/60 chalk-border rounded-2xl p-5"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="font-mono text-xs text-chalk/60 tracking-wide">
              USERNAME
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. priya"
              autoCapitalize="none"
              autoCorrect="off"
              className="bg-turf-900 border border-chalk/20 rounded-lg px-3 py-2.5 text-chalk placeholder:text-chalk/30 focus:outline-none focus:ring-2 focus:ring-scoreboard"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="font-mono text-xs text-chalk/60 tracking-wide">
              GROUP CODE <span className="text-chalk/30">(optional)</span>
            </label>
            <input
              id="code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3"
              maxLength={8}
              className="bg-turf-900 border border-chalk/20 rounded-lg px-3 py-2.5 text-chalk placeholder:text-chalk/30 uppercase focus:outline-none focus:ring-2 focus:ring-scoreboard"
            />
          </div>

          {error && (
            <p className="text-dirt-light text-sm" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-scoreboard hover:bg-scoreboard-dim disabled:bg-scoreboard/30 text-turf-900 font-display text-xl tracking-wide py-3 rounded-xl transition-colors mt-1"
          >
            {busy ? 'CHECKING IN…' : 'JOIN THE GROUP'}
          </button>

          <p className="text-chalk/40 text-xs text-center">
            No password. Existing username? You'll walk back into that account.
          </p>
        </form>
      </div>
    </main>
  )
}
