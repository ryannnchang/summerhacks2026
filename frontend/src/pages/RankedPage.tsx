import { useCallback, useEffect, useState } from 'react'

import { api } from '../api/client'
import { DropStatus } from '../components/DropStatus'
import { JoinGroupCard } from '../components/JoinGroupCard'
import { LeaderboardList } from '../components/LeaderboardList'
import { SignInPrompt } from '../components/SignInPrompt'
import { useDropSocket } from '../hooks/useDropSocket'
import { useSession } from '../hooks/useSession'
import { toBoardRows } from '../lib/leaderboards'
import type { BoardRow } from '../lib/leaderboards'
import type { Drop } from '../types'

type Scope = 'global' | 'friends'

export function RankedPage() {
  const { user, signOut } = useSession()
  const signedIn = Boolean(user)

  const [scope, setScope] = useState<Scope>('global')
  const [drop, setDrop] = useState<Drop | null>(null)
  const [global, setGlobal] = useState<BoardRow[]>([])
  const [friends, setFriends] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)

  const refresh = useCallback(async () => {
    try {
      // The drop clock and the global board are public, so both load either way.
      const [current, board] = await Promise.all([api.currentDrop(), api.leaderboard('global')])
      setDrop(current)
      setGlobal(toBoardRows(board))
      setFriends(user ? toBoardRows(await api.leaderboard('friends')) : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the rankings')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useDropSocket((event) => {
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
    setTriggering(true)
    setError(null)
    try {
      setDrop(await api.triggerDrop())
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
        {signedIn ? (
          <DropStatus drop={drop} onTrigger={() => void trigger()} triggering={triggering} />
        ) : (
          <>
            {/* Signed-out visitors still see the clock — they just can't shoot. */}
            <div className="mb-3">
              <DropStatus drop={drop} readOnly />
            </div>
            <SignInPrompt
              title="WATCHING FROM THE BLEACHERS"
              body="Anyone can watch the clock and the rankings. Sign in to put your own grass on the board."
              returnTo="/capture"
            />
          </>
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
          emptyMessage="No verified grass yet. The first patch sets the bar."
        />
      ) : !signedIn ? (
        <SignInPrompt
          title="FRIENDS ONLY"
          body="Sign in to see how your crew is doing."
          returnTo="/"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <LeaderboardList
            rows={friends}
            currentUsername={user?.username}
            emptyMessage="Just you so far. Share a group code and your friends show up here."
          />
          {/* The only place groups are managed now, and it never blocks play. */}
          <JoinGroupCard onJoined={() => void refresh()} />
        </div>
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
