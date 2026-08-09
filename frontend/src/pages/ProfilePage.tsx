import { useEffect, useState } from 'react'

import { api, ApiError } from '../api/client'
import { EloLadder } from '../components/EloLadder'
import { useSession } from '../hooks/useSession'
import { BASE_RATING, eloTier } from '../lib/eloTiers'
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

/**
 * The photo behind a tuft.
 *
 * Photos can be unreachable: a submission uploaded from a teammate's machine
 * without a storage key wrote its file to *their* disk, so the row points at a
 * path this server can't serve. The onError fallback keeps that a shrug rather
 * than a broken-image icon.
 */
function PhotoModal({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const [broken, setBroken] = useState(false)
  const verified = submission.status === 'verified'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-turf-900/90 flex items-center justify-center p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-[16rem] bg-turf-800 chalk-border-solid rounded-2xl overflow-hidden animate-popin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sits outside the card's top-right corner, clear of the photo. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-chalk text-turf-900 font-bold text-sm leading-none shadow-lg hover:bg-white transition-colors"
        >
          ✕
        </button>

        <div className="relative aspect-square bg-turf-900">
          {broken ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <div
                className="w-16 h-16 grass-glyph"
                dangerouslySetInnerHTML={{ __html: submission.glyph_svg ?? '' }}
              />
              <p className="text-chalk/60 text-sm">
                This photo was uploaded from another device and isn't stored on the server.
              </p>
            </div>
          ) : (
            <img
              src={submission.image_url}
              alt={`Drop #${submission.drop_id}`}
              onError={() => setBroken(true)}
              className="w-full h-full object-cover"
            />
          )}
          <div
            className={`absolute top-3 right-3 px-3 py-1 rounded-full font-display text-sm tracking-wide ${
              verified ? 'bg-turf-500 text-turf-900' : 'bg-dirt text-chalk'
            }`}
          >
            {verified ? 'VERIFIED' : 'REJECTED'}
          </div>
        </div>

        <div className="p-3 flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-xs text-chalk">Drop #{submission.drop_id}</p>
            <p className="font-mono text-xl font-bold text-scoreboard tabular-nums">
              {submission.total_score.toFixed(0)}
            </p>
          </div>
          <p className="text-chalk/40 text-[10px]">{formatDate(submission.submitted_at)}</p>
          {submission.reject_reason && (
            <p className="text-dirt-light text-xs">{submission.reject_reason}</p>
          )}
          <dl className="grid grid-cols-3 gap-2 pt-2 border-t border-chalk/10 text-center">
            <Stat label="QUALITY" value={submission.quality_score.toFixed(0)} />
            <Stat label="SPEED" value={submission.speed_score.toFixed(0)} />
            <Stat label="TIME" value={`${submission.response_seconds.toFixed(0)}s`} />
          </dl>
        </div>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { session, signOut } = useSession()
  const [selected, setSelected] = useState<Submission | null>(null)
  const [showRanks, setShowRanks] = useState(false)

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

          <div className="flex gap-2.5 mb-3">
            <Stat label="ELO" value={me.elo === null ? '—' : String(me.elo)} />
            <Stat label="POINTS" value={me.total_score.toFixed(0)} />
            <Stat label="STREAK" value={String(me.streak)} />
          </div>

          {/* The rating is four digits of nothing until you know where it sits on the ladder. */}
          <div className="flex flex-col gap-2.5 mb-6">
            <div className="flex items-center gap-2.5 rounded-xl bg-turf-800/70 chalk-border p-3">
              <span className={`text-2xl leading-none ${eloTier(me.elo).className}`} aria-hidden>
                {eloTier(me.elo).symbol}
              </span>
              <div className="min-w-0">
                <p className={`font-display text-xl tracking-wide leading-none ${eloTier(me.elo).className}`}>
                  {eloTier(me.elo).name.toUpperCase()}
                </p>
                <p className="text-chalk/40 text-[10px] font-mono mt-1">
                  {me.elo === null
                    ? 'NO RATING YET'
                    : me.elo === BASE_RATING
                      ? `${me.elo} · STARTING RATING`
                      : `${me.elo} · ${me.elo > BASE_RATING ? '+' : ''}${me.elo - BASE_RATING} FROM BASE`}
                </p>
              </div>

              {/* Collapsed by default: the ladder is reference material, and the
                  profile's own subject is the rank you already hold. */}
              <button
                onClick={() => setShowRanks((open) => !open)}
                aria-expanded={showRanks}
                className={`ml-auto shrink-0 self-stretch px-3 rounded-lg font-mono text-[10px] tracking-widest transition-colors ${
                  showRanks
                    ? 'bg-scoreboard text-turf-900'
                    : 'border border-chalk/20 text-chalk/60 hover:text-chalk hover:border-chalk/40'
                }`}
              >
                RANKS
              </button>
            </div>

            {showRanks && <EloLadder elo={me.elo} />}
          </div>

          <h2 className="font-mono text-chalk/50 text-xs tracking-[0.2em] mb-3">YOUR FIELD</h2>
          {history === null ? (
            <p className="font-mono text-chalk/40 text-sm">loading…</p>
          ) : history.length === 0 ? (
            <p className="text-chalk/50 text-sm">
              Bare dirt so far. Touch some grass when the next drop fires.
            </p>
          ) : (
            <>
              {/* Every verified drop is a tuft, standing on a shared ground line.
                  Size tracks quality, so a good patch literally grows taller. */}
              <div className="relative">
                <div className="relative flex flex-wrap items-end justify-center gap-x-1 gap-y-3">
                  {history.map((s) => {
                    const verified = s.status === 'verified'
                    // 60px at score 0 up to 116px at 100 — a visible spread.
                    // Rejections draw at a fixed small size: they're dead either way.
                    const size = verified ? 60 + Math.min(s.quality_score, 100) * 0.56 : 66
                    if (!s.glyph_svg) return null
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s)}
                        title={`Drop #${s.drop_id} · ${
                          verified ? '' : 'rejected · '
                        }${s.total_score.toFixed(0)} pts · ${formatDate(s.submitted_at)}`}
                        aria-label={`View photo from drop ${s.drop_id}`}
                        style={{ width: size, height: size }}
                        className={`grass-glyph shrink-0 transition-transform hover:-translate-y-1 focus:outline-none focus:-translate-y-1 cursor-pointer ${
                          verified ? '' : 'opacity-80'
                        }`}
                        dangerouslySetInnerHTML={{ __html: s.glyph_svg }}
                      />
                    )
                  })}
                </div>
              </div>

              <p className="text-chalk/40 text-xs mt-2 text-center">
                {history.filter((s) => s.status === 'verified').length} thriving ·{' '}
                {history.filter((s) => s.status !== 'verified').length} withered · tap a patch for
                the photo
              </p>
            </>
          )}

          <button
            onClick={() => void signOut()}
            className="mt-8 w-full border border-chalk/20 text-chalk/70 hover:text-chalk font-display text-xl tracking-wide py-3 rounded-xl transition-colors"
          >
            SIGN OUT
          </button>
        </>
      )}

      {selected && <PhotoModal submission={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
