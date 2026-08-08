import { useState } from 'react'

import { api } from '../api/client'
import type { Group } from '../types'

const INPUT =
  'w-full bg-turf-900 border border-chalk/20 rounded-lg px-3 py-2.5 text-chalk text-sm placeholder:text-chalk/30 focus:outline-none focus:ring-2 focus:ring-scoreboard'

/**
 * Group create/join, inline on the Friends tab.
 *
 * Groups no longer gate play — drops are global. All a group does now is decide
 * who shows up when the leaderboard is filtered to Friends.
 */
export function JoinGroupCard({ onJoined }: { onJoined: (group: Group) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<Group>) {
    setBusy(true)
    setError(null)
    try {
      onJoined(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-turf-800/60 chalk-border rounded-2xl p-5 flex flex-col gap-5">
      <div>
        <p className="font-display text-2xl tracking-wide text-chalk leading-none">ADD FRIENDS</p>
        <p className="text-chalk/60 text-sm mt-1">
          Share a group and you'll see each other here. You're already scoring either way.
        </p>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => api.createGroup(name.trim()))
        }}
      >
        <label htmlFor="new-group" className="font-mono text-[10px] text-chalk/50 tracking-widest">
          START A GROUP
        </label>
        <input
          id="new-group"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Basement Dwellers Anonymous"
          required
          className={INPUT}
        />
        <button
          disabled={busy}
          className="w-full bg-scoreboard hover:bg-scoreboard-dim disabled:bg-scoreboard/30 text-turf-900 font-display text-lg tracking-wide py-2 rounded-xl transition-colors"
        >
          CREATE
        </button>
      </form>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => api.joinGroup(code.trim()))
        }}
      >
        <label htmlFor="join-code" className="font-mono text-[10px] text-chalk/50 tracking-widest">
          JOIN WITH A CODE
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="A1B2C3"
          maxLength={8}
          required
          className={`${INPUT} uppercase font-mono tracking-widest`}
        />
        <button
          disabled={busy}
          className="w-full border border-chalk/20 text-chalk/80 hover:text-chalk hover:border-chalk/40 disabled:opacity-50 font-display text-lg tracking-wide py-2 rounded-xl transition-colors"
        >
          JOIN
        </button>
      </form>

      {error && (
        <p className="text-dirt-light text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
