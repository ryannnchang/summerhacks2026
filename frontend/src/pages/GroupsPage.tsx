import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import type { Group } from '../types'

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .listGroups()
      .then(setGroups)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const group = await api.createGroup(name.trim())
      navigate(`/groups/${group.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that group')
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const group = await api.joinGroup(code.trim())
      navigate(`/groups/${group.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that group')
    }
  }

  return (
    <main className="page">
      <h1 className="page__title">Your groups</h1>

      {loading ? (
        <p className="card__hint">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="card__hint">No groups yet. Start one below and drag your friends outside.</p>
      ) : (
        <ul className="group-grid">
          {groups.map((g) => (
            <li key={g.id}>
              <Link className="group-card" to={`/groups/${g.id}`}>
                <h2>{g.name}</h2>
                <p>
                  {g.member_count} member{g.member_count === 1 ? '' : 's'}
                </p>
                <code>{g.join_code}</code>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="group-forms">
        <form className="card" onSubmit={create}>
          <h2 className="card__title">Start a group</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Basement Dwellers Anonymous"
            required
          />
          <button className="button button--primary">Create</button>
        </form>

        <form className="card" onSubmit={join}>
          <h2 className="card__title">Join with a code</h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="A1B2C3"
            maxLength={8}
            required
          />
          <button className="button button--ghost">Join</button>
        </form>
      </div>

      {error && <p className="alert alert--error">{error}</p>}
    </main>
  )
}
