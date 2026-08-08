import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { api } from '../api/client'
import { GroupFeed } from '../components/GroupFeed'
import { LiveDropBanner } from '../components/LiveDropBanner'
import { TouchGrassButton } from '../components/TouchGrassButton'
import { formatDuration, useCountdown } from '../hooks/useCountdown'
import { useGroupSocket } from '../hooks/useGroupSocket'
import { useSession } from '../hooks/useSession'
import type { Drop, GroupDetail, LeaderboardEntry, Submission } from '../types'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1">
      <p className="font-mono text-scoreboard font-bold text-xl tabular-nums">{value}</p>
      <p className="text-chalk/50 text-[10px] font-mono">{label}</p>
    </div>
  )
}

export function DashboardPage() {
  const { user, groupId } = useSession()

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [board, setBoard] = useState<LeaderboardEntry[]>([])
  const [feed, setFeed] = useState<Submission[]>([])
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [dismissedDropId, setDismissedDropId] = useState<number | null>(null)

  const remaining = useCountdown(drop?.status === 'active' ? drop.expires_at : null)

  const refresh = useCallback(async () => {
    if (groupId === null) return
    try {
      const [detail, current, leaders] = await Promise.all([
        api.getGroup(groupId),
        api.currentDrop(groupId),
        api.leaderboard(groupId),
      ])
      setGroup(detail)
      setDrop(current)
      setBoard(leaders)
      setFeed(current ? await api.dropSubmissions(groupId, current.id) : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this group')
    }
  }, [groupId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const live = useGroupSocket(groupId, (event) => {
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
    if (groupId === null) return
    setTriggering(true)
    setError(null)
    try {
      setDrop(await api.triggerDrop(groupId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a drop')
    } finally {
      setTriggering(false)
    }
  }

  if (groupId === null) return <Navigate to="/groups" replace />

  const me = board.find((entry) => entry.user_id === user?.id)
  const dropIsLive = drop?.status === 'active'
  const canSubmit = dropIsLive && drop !== null && !drop.has_submitted
  const showBanner = dropIsLive && drop !== null && drop.id !== dismissedDropId && !drop.has_submitted

  return (
    <main className="min-h-screen pb-24">
      {showBanner && drop && (
        <LiveDropBanner drop={drop} onDismiss={() => setDismissedDropId(drop.id)} />
      )}

      <header className="px-5 pt-8 pb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-chalk/50 text-xs font-mono">WELCOME BACK</p>
          <h1 className="font-display text-3xl tracking-wide text-chalk leading-none mt-0.5 truncate">
            {(user?.display_name ?? '').toUpperCase()}
          </h1>
        </div>
        {group && (
          <Link
            to={`/groups/${group.id}`}
            className="bg-turf-800 chalk-border rounded-lg px-3 py-2 text-right flex-shrink-0 hover:border-scoreboard/60 transition-colors"
          >
            <p className="text-chalk/40 text-[10px] font-mono">GROUP CODE</p>
            <p className="font-mono text-scoreboard font-bold text-sm">{group.join_code}</p>
          </Link>
        )}
      </header>

      <div className="px-5 flex flex-col gap-6">
        <TouchGrassButton
          hint={
            canSubmit
              ? `Drop is live — ${remaining === null ? '…' : formatDuration(remaining)} left`
              : dropIsLive
                ? 'You already submitted this drop.'
                : 'No drop running. Snap anyway to warm up.'
          }
          disabled={!canSubmit}
        />

        {!dropIsLive && (
          <button
            onClick={() => void trigger()}
            disabled={triggering}
            className="w-full text-chalk/60 text-sm py-2.5 border border-chalk/20 rounded-xl hover:text-chalk hover:border-chalk/40 disabled:opacity-50 transition-colors font-mono tracking-wide"
          >
            {triggering ? 'DROPPING…' : 'START A DROP NOW'}
          </button>
        )}

        <div className="flex items-center justify-between text-center bg-turf-800/50 chalk-border rounded-xl p-3">
          <Stat value={Math.round(me?.total_score ?? 0).toLocaleString()} label="TOTAL SCORE" />
          <div className="w-px h-8 bg-chalk/10" />
          <Stat value={String(me?.streak ?? 0)} label="DAY STREAK" />
          <div className="w-px h-8 bg-chalk/10" />
          <Stat value={me ? `#${me.rank}` : '—'} label="GROUP RANK" />
        </div>

        <GroupFeed submissions={feed} live={live} />

        {error && (
          <p className="text-dirt-light text-sm chalk-border rounded-xl p-3" role="alert">
            {error}
          </p>
        )}
      </div>
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
