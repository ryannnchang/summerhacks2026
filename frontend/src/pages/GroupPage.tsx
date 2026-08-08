import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { api } from '../api/client'
import { MemberList } from '../components/MemberList'
import { useSession } from '../hooks/useSession'
import type { GroupDetail } from '../types'

/**
 * Group settings: the join code to pass around, and who's in. The scoreboard side of
 * a group lives on /dashboard and /leaderboard, driven by whichever group is active.
 */
export function GroupPage() {
  const { groupId: raw } = useParams()
  const groupId = Number(raw)
  const navigate = useNavigate()
  const { user, groupId: activeGroupId, selectGroup } = useSession()

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setGroup(await api.getGroup(groupId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this group')
    }
  }, [groupId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function copyCode() {
    if (!group) return
    await navigator.clipboard.writeText(group.join_code).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (error && !group) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5 pb-24">
        <p className="text-dirt-light text-sm">{error}</p>
      </main>
    )
  }

  if (!group) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 pb-24">
        <div className="w-8 h-8 border-2 border-scoreboard border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-chalk/50 text-sm">loading the roster…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-5 pt-8">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-chalk/60 hover:text-chalk text-sm font-mono"
        >
          ← BACK
        </button>
        {group.id !== activeGroupId && (
          <button
            onClick={() => {
              selectGroup(group.id)
              navigate('/dashboard')
            }}
            className="font-mono text-xs tracking-widest text-scoreboard hover:text-scoreboard-dim transition-colors"
          >
            PLAY THIS GROUP
          </button>
        )}
      </div>

      <header className="mb-6">
        <p className="text-chalk/50 text-xs font-mono">
          {group.member_count} member{group.member_count === 1 ? '' : 's'}
        </p>
        <h1 className="font-display text-4xl tracking-wide text-chalk leading-none mt-0.5">
          {group.name.toUpperCase()}
        </h1>
      </header>

      <button
        onClick={() => void copyCode()}
        className="w-full bg-turf-800/60 chalk-border rounded-2xl p-5 mb-6 text-left hover:border-scoreboard/60 transition-colors"
      >
        <p className="text-chalk/40 text-[10px] font-mono tracking-wide">JOIN CODE — TAP TO COPY</p>
        <p className="font-mono text-scoreboard font-bold text-3xl tracking-[0.2em] mt-1">
          {group.join_code}
        </p>
        {copied && <p className="text-turf-400 text-xs font-mono mt-1">copied</p>}
      </button>

      <h2 className="font-display text-2xl tracking-wide text-chalk mb-3">ROSTER</h2>
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

      {error && (
        <p className="text-dirt-light text-sm mt-4" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
