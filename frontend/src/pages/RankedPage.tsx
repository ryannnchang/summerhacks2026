import { useCallback, useEffect, useState } from 'react'

import { api } from '../api/client'
import { DropStatus } from '../components/DropStatus'
import { JoinGroupCard } from '../components/JoinGroupCard'
import { LeaderboardList } from '../components/LeaderboardList'
import { SignInPrompt } from '../components/SignInPrompt'
import { useGroupSocket } from '../hooks/useGroupSocket'
import { useSession } from '../hooks/useSession'
import { globalLeaderboard, toBoardRows } from '../lib/leaderboards'
import type { BoardRow } from '../lib/leaderboards'
import type { Drop, Group } from '../types'

type Scope = 'global' | 'friends'

export function RankedPage() {
  const { user, groupId, selectGroup, signOut } = useSession()
  const signedIn = Boolean(user)

  const [scope, setScope] = useState<Scope>('global')
  const [group, setGroup] = useState<Group | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [global, setGlobal] = useState<BoardRow[]>([])
  const [friends, setFriends] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)

  const refresh = useCallback(async () => {
    try {
      // The global board comes from the public mural, so it loads either way.
      setGlobal(await globalLeaderboard())

      if (!user) {
        setGroup(null)
        setDrop(null)
        setFriends([])
        setError(null)
        return
      }

      const groups = await api.listGroups()

      // No /groups page any more, so land the visitor in a group automatically.
      // Clearing on the empty case matters too: a stale id from a group they left
      // would otherwise follow them into /capture.
      const active = groups.find((g) => g.id === groupId) ?? groups[0] ?? null
      setGroup(active)
      if ((active?.id ?? null) !== groupId) selectGroup(active?.id ?? null)

      const [current, board] = await Promise.all([
        active ? api.currentDrop(active.id) : Promise.resolve(null),
        active ? api.leaderboard(active.id) : Promise.resolve([]),
      ])
      setDrop(current)
      setFriends(toBoardRows(board))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the rankings')
    } finally {
      setLoading(false)
    }
  }, [user, groupId, selectGroup])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useGroupSocket(group?.id ?? null, (event) => {
    if (event.type === 'drop.started') notifyDrop()
    if (
      event.type === 'drop.started' ||
      event.type === 'drop.closed' ||
      event.type === 'submission.created'
    ) {
      void refresh()
    }
  })

  async function trigger() {
    if (!group) {
      setError('Join a group before starting a drop.')
      return
    }
    setTriggering(true)
    setError(null)
    try {
      setDrop(await api.triggerDrop(group.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a drop')
    } finally {
      setTriggering(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-5 pt-8 max-w-md mx-auto">
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="font-mono text-scoreboard text-[10px] tracking-[0.3em]">SEASON 01</p>
          <h1 className="font-display text-5xl tracking-wide text-chalk leading-none mt-0.5">
            RANKED GRASS
          </h1>
        </div>
        {signedIn && (
          <button
            onClick={() => void signOut()}
            className="text-chalk/40 hover:text-chalk text-[10px] font-mono tracking-widest flex-shrink-0 pt-2"
          >
            SIGN OUT
          </button>
        )}
      </header>

      <div className="mb-6">
        {signedIn && group ? (
          <DropStatus drop={drop} onTrigger={() => void trigger()} triggering={triggering} />
        ) : signedIn ? (
          // Drops belong to a group, so there is nothing to trigger yet. Showing
          // DropStatus here would render a "DROP NOW" button that can't do anything.
          <div className="bg-turf-800/60 chalk-border rounded-2xl p-5 flex flex-col gap-3">
            <div>
              <p className="font-display text-2xl tracking-wide text-chalk leading-none">
                NO CREW YET
              </p>
              <p className="text-chalk/60 text-sm mt-1">
                Drops go out to a group. Start one or join with a code, then the clock can run.
              </p>
            </div>
            <button
              onClick={() => setScope('friends')}
              className="w-full bg-scoreboard hover:bg-scoreboard-dim text-turf-900 font-display text-lg tracking-wide py-2.5 rounded-xl transition-colors"
            >
              SET UP A GROUP
            </button>
          </div>
        ) : (
          <SignInPrompt
            title="WATCHING FROM THE BLEACHERS"
            body="Anyone can watch the rankings. Sign in to get drop alerts and put your own grass on the board."
            returnTo="/capture"
          />
        )}
      </div>

      <div className="flex gap-1 p-1 bg-turf-800/60 rounded-xl mb-4">
        {(['global', 'friends'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`flex-1 py-2 rounded-lg font-mono text-xs tracking-widest transition-colors ${
              scope === value ? 'bg-scoreboard text-turf-900' : 'text-chalk/50 hover:text-chalk/80'
            }`}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-mono text-chalk/50 text-sm text-center py-8">loading the board…</p>
      ) : scope === 'global' ? (
        <LeaderboardList
          rows={global}
          currentUsername={user?.username}
          emptyMessage="No verified grass anywhere yet. The first patch sets the bar."
        />
      ) : !signedIn ? (
        <SignInPrompt
          title="FRIENDS ONLY"
          body="Sign in to see how your crew is doing."
          returnTo="/"
        />
      ) : !group ? (
        <JoinGroupCard
          onJoined={(joined) => {
            selectGroup(joined.id)
            void refresh()
          }}
        />
      ) : (
        <LeaderboardList rows={friends} currentUsername={user?.username} />
      )}

      {scope === 'friends' && group && (
        <p className="text-chalk/40 text-xs font-mono text-center mt-4">
          {group.name.toUpperCase()} · CODE {group.join_code}
        </p>
      )}

      {error && (
        <p className="text-dirt-light text-sm mt-4" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}

function notifyDrop() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification('🌱 Grass drop is live', { body: 'Get outside. The clock is running.' })
  } else if (Notification.permission !== 'denied') {
    void Notification.requestPermission()
  }
}
