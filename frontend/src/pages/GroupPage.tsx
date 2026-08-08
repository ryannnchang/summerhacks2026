import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '../api/client'
import { DropBanner } from '../components/DropBanner'
import { GrassCapture } from '../components/GrassCapture'
import { Leaderboard } from '../components/Leaderboard'
import { MemberList } from '../components/MemberList'
import { useAuth } from '../hooks/useAuth'
import { useGroupSocket } from '../hooks/useGroupSocket'
import type { Drop, GroupDetail, LeaderboardEntry, Submission } from '../types'

export function GroupPage() {
  const { groupId: raw } = useParams()
  const groupId = Number(raw)
  const { user } = useAuth()

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [board, setBoard] = useState<LeaderboardEntry[]>([])
  const [feed, setFeed] = useState<Submission[]>([])
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [detail, current, leaders] = await Promise.all([
        api.getGroup(groupId),
        api.currentDrop(groupId),
        api.leaderboard(groupId),
      ])
      setGroup(detail)
      setDrop(current)
      setBoard(leaders)
      if (current) setFeed(await api.dropSubmissions(groupId, current.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this group')
    }
  }, [groupId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const live = useGroupSocket(Number.isFinite(groupId) ? groupId : null, (event) => {
    if (event.type === 'drop.started' || event.type === 'drop.closed') {
      if (event.type === 'drop.started') notifyDrop()
      void refresh()
    }
    if (event.type === 'submission.created') void refresh()
  })

  async function trigger() {
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

  if (error && !group) return <main className="page">{error}</main>
  if (!group) return <main className="page">Loading…</main>

  const dropIsOpen = drop?.status === 'active'

  return (
    <main className="page group-page">
      <header className="group-page__header">
        <div>
          <h1 className="page__title">{group.name}</h1>
          <p className="card__hint">
            Join code <code>{group.join_code}</code> · {live ? '🟢 live' : '⚪️ reconnecting'}
          </p>
        </div>
      </header>

      <DropBanner drop={drop} onTrigger={() => void trigger()} triggering={triggering} />

      {dropIsOpen && drop && !drop.has_submitted && (
        <GrassCapture
          groupId={groupId}
          dropId={drop.id}
          onSubmitted={() => void refresh()}
        />
      )}

      <div className="group-page__columns">
        <section className="card">
          <h2 className="card__title">Leaderboard</h2>
          <Leaderboard entries={board} currentUserId={user?.id} />
        </section>

        <section className="card">
          <h2 className="card__title">Members</h2>
          <MemberList
            members={group.members}
            ownerId={group.owner_id}
            currentUserId={user?.id}
            onAdd={async (username) => {
              await api.addMember(groupId, username)
              await refresh()
            }}
            onRemove={async (userId) => {
              await api.removeMember(groupId, userId)
              await refresh()
            }}
          />
        </section>
      </div>

      {feed.length > 0 && (
        <section className="card">
          <h2 className="card__title">This drop</h2>
          <ul className="feed">
            {feed.map((s) => (
              <li key={s.id} className={`feed__item feed__item--${s.status}`}>
                <img src={s.thumbnail_url} alt={`Grass by ${s.username}`} loading="lazy" />
                <div>
                  <strong>@{s.username}</strong>
                  <p>
                    {s.status === 'verified'
                      ? `${s.total_score.toFixed(0)} pts · ${s.response_seconds.toFixed(0)}s`
                      : s.reject_reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="alert alert--error">{error}</p>}
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
