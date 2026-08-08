import { useEffect, useState } from 'react'

import { api, ApiError } from '../api/client'
import { useSession } from '../hooks/useSession'
import type { Submission, User } from '../types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-turf-800/60 chalk-border rounded-xl p-3 text-center">
      <p className="text-chalk/50 text-[10px] font-mono tracking-wide">{label}</p>
      <p className="font-mono text-chalk font-bold text-xl tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

export function ProfilePage() {
  const { session, signOut } = useSession()

  // Fetched fresh rather than read from the session context, so the elo and
  // score reflect the latest submission, not the sign-in snapshot.
  const [me, setMe] = useState<User | null>(null)
  const [history, setHistory] = useState<Submission[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setMe(user)
        setDraft(user.username)
      })
      .catch((err: Error) => setLoadError(err.message))
    api
      .mySubmissions()
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [])

  async function handleSave() {
    if (!me || draft === me.username) {
      setEditing(false)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await api.updateMe({ username: draft })
      setMe(updated)
      setDraft(updated.username)
      setEditing(false)
    } catch (err) {
      setSaveError(
        err instanceof ApiError && err.status === 409
          ? 'That username is taken.'
          : 'Could not save. Letters, numbers, dots, dashes only (2-32).',
      )
    } finally {
      setSaving(false)
    }
  }

  const avatarUrl = session?.user.user_metadata?.avatar_url as string | undefined

  return (
    <main className="min-h-screen flex flex-col px-5 pt-8 pb-24 max-w-md mx-auto w-full">
      <h1 className="font-display text-2xl tracking-wide text-chalk mb-6 text-center">PROFILE</h1>

      {loadError && (
        <p className="text-dirt-light text-sm text-center" role="alert">
          {loadError}
        </p>
      )}

      {me && (
        <>
          <div className="flex items-center gap-4 mb-5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full chalk-border-solid"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-turf-500 flex items-center justify-center font-display text-2xl text-turf-900">
                {me.username[0]?.toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={32}
                    autoFocus
                    className="flex-1 min-w-0 bg-turf-800 chalk-border rounded-lg px-3 py-1.5 font-mono text-sm text-chalk focus:outline-none focus:border-scoreboard"
                  />
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="bg-scoreboard hover:bg-scoreboard-dim disabled:opacity-50 text-turf-900 font-display tracking-wide px-4 rounded-lg transition-colors"
                  >
                    {saving ? '…' : 'SAVE'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-mono text-chalk font-bold truncate">{me.username}</p>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-chalk/40 hover:text-chalk text-xs font-mono shrink-0"
                  >
                    EDIT
                  </button>
                </div>
              )}
              <p className="text-chalk/50 text-xs truncate mt-0.5">{session?.user.email}</p>
              {saveError && (
                <p className="text-dirt-light text-xs mt-1" role="alert">
                  {saveError}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 mb-6">
            <Stat label="ELO" value={me.elo === null ? '—' : String(me.elo)} />
            <Stat label="POINTS" value={me.total_score.toFixed(0)} />
            <Stat label="STREAK" value={String(me.streak)} />
          </div>

          <h2 className="font-mono text-chalk/50 text-xs tracking-[0.2em] mb-3">PAST DROPS</h2>
          {history === null ? (
            <p className="font-mono text-chalk/40 text-sm">loading…</p>
          ) : history.length === 0 ? (
            <p className="text-chalk/50 text-sm">
              No drops logged yet. Touch some grass when the next one fires.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {history.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 bg-turf-800/60 chalk-border rounded-xl p-2.5"
                >
                  <img
                    src={s.thumbnail_url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-chalk">
                      Drop #{s.drop_id}
                      <span
                        className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle ${
                          s.status === 'verified'
                            ? 'bg-turf-500/30 text-turf-400'
                            : 'bg-dirt/40 text-dirt-light'
                        }`}
                      >
                        {s.status === 'verified' ? 'VERIFIED' : 'REJECTED'}
                      </span>
                    </p>
                    <p className="text-chalk/40 text-xs mt-0.5">{formatDate(s.submitted_at)}</p>
                  </div>
                  <p className="font-mono text-scoreboard font-bold tabular-nums shrink-0">
                    {s.status === 'verified' ? s.total_score.toFixed(0) : '0'}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => void signOut()}
            className="mt-8 w-full border border-chalk/20 text-chalk/70 hover:text-chalk font-display text-xl tracking-wide py-3 rounded-xl transition-colors"
          >
            SIGN OUT
          </button>
        </>
      )}
    </main>
  )
}
