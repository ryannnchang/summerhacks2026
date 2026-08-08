import { useState } from 'react'

import type { Member } from '../types'

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
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.user_id} className="member-list__row">
            <span className="avatar" aria-hidden>
              {m.display_name.charAt(0).toUpperCase()}
            </span>
            <span className="member-list__name">
              {m.display_name}
              {m.user_id === ownerId && <span className="badge">owner</span>}
            </span>
            {currentUserId === ownerId && m.user_id !== ownerId && (
              <button
                className="button button--tiny"
                onClick={() => void onRemove(m.user_id)}
                aria-label={`Remove ${m.display_name}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <form className="member-list__add" onSubmit={submit}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="add by username"
          aria-label="Username to add"
        />
        <button className="button button--ghost" disabled={busy}>
          Add
        </button>
      </form>
      {error && <p className="alert alert--error">{error}</p>}
    </div>
  )
}
