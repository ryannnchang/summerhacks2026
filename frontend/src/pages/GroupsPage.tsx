import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { useSession } from '../hooks/useSession'
import type { Group } from '../types'

export function GroupsPage() {
  const navigate = useNavigate()
  const { groupId, selectGroup, signOut } = useSession()

  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .listGroups()
      .then(setGroups)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function enter(group: Group) {
    selectGroup(group.id)
    navigate('/dashboard')
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      enter(await api.createGroup(name.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that group')
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      enter(await api.joinGroup(code.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that group')
    }
  }

  const inputClass =
    'w-full bg-turf-900 border border-chalk/20 rounded-lg px-3 py-2.5 text-chalk placeholder:text-chalk/30 focus:outline-none focus:ring-2 focus:ring-scoreboard'

  return (
    <main className="min-h-screen pb-24 px-5 pt-8">
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-chalk/50 text-xs font-mono">SEASON 01</p>
          <h1 className="font-display text-3xl tracking-wide text-chalk leading-none mt-0.5">
            YOUR GROUPS
          </h1>
        </div>
        <button
          onClick={signOut}
          className="text-chalk/50 hover:text-chalk text-xs font-mono flex-shrink-0 pt-1"
        >
          SIGN OUT
        </button>
      </header>

      {loading ? (
        <p className="font-mono text-chalk/50 text-sm">loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-chalk/60 text-sm chalk-border rounded-xl p-4">
          No groups yet. Start one below and drag your friends outside.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 mb-6">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => enter(g)}
                className={`w-full text-left flex items-center gap-3 rounded-xl p-4 chalk-border transition-colors hover:border-scoreboard/60 ${
                  g.id === groupId ? 'bg-scoreboard/10 border-scoreboard/50' : 'bg-turf-800/70'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-display text-xl tracking-wide text-chalk truncate">
                    {g.name.toUpperCase()}
                  </p>
                  <p className="text-chalk/50 text-xs">
                    {g.member_count} member{g.member_count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-mono text-scoreboard font-bold text-sm flex-shrink-0">
                  {g.join_code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          onSubmit={create}
          className="flex flex-col gap-3 bg-turf-800/60 chalk-border rounded-2xl p-5"
        >
          <h2 className="font-display text-2xl tracking-wide text-chalk">START A GROUP</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Basement Dwellers Anonymous"
            required
            className={inputClass}
            aria-label="New group name"
          />
          <button className="w-full bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-xl tracking-wide py-2.5 rounded-xl transition-colors">
            CREATE
          </button>
        </form>

        <form
          onSubmit={join}
          className="flex flex-col gap-3 bg-turf-800/60 chalk-border rounded-2xl p-5"
        >
          <h2 className="font-display text-2xl tracking-wide text-chalk">JOIN WITH A CODE</h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="A1B2C3"
            maxLength={8}
            required
            className={`${inputClass} uppercase font-mono tracking-widest`}
            aria-label="Group join code"
          />
          <button className="w-full border border-chalk/20 text-chalk/80 hover:text-chalk hover:border-chalk/40 font-display text-xl tracking-wide py-2.5 rounded-xl transition-colors">
            JOIN
          </button>
        </form>
      </div>

      {error && (
        <p className="text-dirt-light text-sm mt-4" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
