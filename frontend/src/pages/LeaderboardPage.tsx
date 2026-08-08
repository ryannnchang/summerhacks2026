import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { api } from '../api/client'
import { LeaderboardList } from '../components/LeaderboardList'
import { useSession } from '../hooks/useSession'
import type { GroupDetail, LeaderboardEntry } from '../types'

export function LeaderboardPage() {
  const { user, groupId } = useSession()

  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (groupId === null) return
    Promise.all([api.leaderboard(groupId), api.getGroup(groupId)])
      .then(([board, detail]) => {
        setEntries(board)
        setGroup(detail)
      })
      .catch((err: Error) => setError(err.message))
  }, [groupId])

  if (groupId === null) return <Navigate to="/groups" replace />

  return (
    <main className="min-h-screen pb-24">
      <header className="px-5 pt-8 pb-5">
        <p className="text-chalk/50 text-xs font-mono">{(group?.name ?? 'YOUR GROUP').toUpperCase()}</p>
        <h1 className="font-display text-3xl tracking-wide text-chalk leading-none mt-0.5">
          LEADERBOARD
        </h1>
      </header>

      <div className="px-5">
        <LeaderboardList entries={entries} currentUserId={user?.id} />
        {error && (
          <p className="text-dirt-light text-sm mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
