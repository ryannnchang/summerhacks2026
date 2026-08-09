import { useState } from 'react'

import { api } from '../api/client'

const INPUT =
  'w-full bg-turf-900 border border-chalk/20 rounded-lg px-3 py-2.5 text-chalk text-sm placeholder:text-chalk/30 focus:outline-none focus:ring-2 focus:ring-scoreboard'

/**
 * Add-friend card, inline on the Friends tab.
 *
 * Friendship is email-only in the UI now; groups still exist behind the API
 * (adding a friend shares a group under the hood) but codes are no longer
 * exposed. Friends never gate play — drops are global.
 */
export function JoinGroupCard({ onJoined }: { onJoined: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  return (
    <div className="bg-turf-800 chalk-border rounded-2xl p-5 flex flex-col gap-5">
      <div>
        <p className="font-display text-2xl tracking-wide text-chalk leading-none">ADD FRIENDS</p>
        <p className="text-chalk/60 text-sm mt-1">
          Add someone by the email they sign in with and you'll see each other here.
        </p>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void (async () => {
            setBusy(true)
            setError(null)
            setAdded(null)
            try {
              const friend = await api.addFriend(email.trim())
              setAdded(friend.display_name || friend.username)
              setEmail('')
              onJoined()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'That did not work')
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        <label htmlFor="friend-email" className="font-mono text-[10px] text-chalk/50 tracking-widest">
          THEIR EMAIL
        </label>
        <input
          id="friend-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="them@gmail.com"
          required
          className={INPUT}
        />
        <button
          disabled={busy}
          className="w-full bg-scoreboard hover:bg-scoreboard-dim disabled:bg-scoreboard/30 text-turf-900 font-display text-lg tracking-wide py-2 rounded-xl transition-colors"
        >
          {busy ? 'ADDING…' : 'ADD FRIEND'}
        </button>
      </form>

      {added && (
        <p className="text-turf-400 text-sm" role="status">
          {added} is now on your friends board.
        </p>
      )}
      {error && (
        <p className="text-dirt-light text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
