import { useState } from 'react'

import type { Member } from '../types'
import { Avatar } from './Avatar'

interface Props {
  members: Member[]
  ownerId: number
  currentUserId?: number
  onAdd: (username: string) => Promise<void>
  onRemove: (userId: number) => Promise<void>
}

export function MemberList({ members, ownerId, currentUserId, onAdd, onRemove }: Props) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(username.trim())
      setUsername('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that member')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center gap-3 bg-turf-800/70 chalk-border rounded-xl p-3"
          >
            <Avatar name={m.display_name} size="sm" />
            <span className="flex-1 min-w-0 text-chalk text-sm font-semibold truncate">
              {m.display_name}
              {m.user_id === ownerId && (
                <span className="ml-2 font-mono text-[10px] tracking-wide text-scoreboard">
                  OWNER
                </span>
              )}
            </span>
            <span className="font-mono text-scoreboard text-sm tabular-nums flex-shrink-0">
              {Math.round(m.total_score).toLocaleString()}
            </span>
            {currentUserId === ownerId && m.user_id !== ownerId && (
              <button
                onClick={() => void onRemove(m.user_id)}
                aria-label={`Remove ${m.display_name}`}
                className="text-chalk/40 hover:text-dirt-light text-lg leading-none px-1 flex-shrink-0 transition-colors"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="flex gap-2 mt-4">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="add by username"
          aria-label="Username to add"
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 bg-turf-900 border border-chalk/20 rounded-lg px-3 py-2 text-chalk text-sm placeholder:text-chalk/30 focus:outline-none focus:ring-2 focus:ring-scoreboard"
        />
        <button
          disabled={busy}
          className="border border-chalk/20 text-chalk/80 hover:text-chalk hover:border-chalk/40 disabled:opacity-50 font-mono text-xs tracking-widest px-4 rounded-lg transition-colors"
        >
          ADD
        </button>
      </form>

      {error && (
        <p className="text-dirt-light text-sm mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
