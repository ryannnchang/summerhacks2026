import { useCallback, useEffect, useState } from 'react'

import { api } from '../api/client'
import { GrassMap } from '../components/GrassMap'
import { useSession } from '../hooks/useSession'
import type { MapData, MapPatch } from '../types'

const TORONTO: [number, number] = [43.6532, -79.3832]
const DEFAULT_ZOOM = 12
const REFRESH_MS = 30_000

/** Popup photo with the glyph as a fallback for unreachable cross-device files. */
function PopupThumb({ patch }: { patch: MapPatch }) {
  const [broken, setBroken] = useState(false)

  // A new selection gets a fresh chance even if the last photo was broken.
  useEffect(() => setBroken(false), [patch.submission_id])

  if (broken && patch.glyph_svg) {
    return (
      <div
        className="w-16 h-16 rounded-lg flex-shrink-0 grass-glyph bg-turf-900/60 p-1"
        dangerouslySetInnerHTML={{ __html: patch.glyph_svg }}
      />
    )
  }
  return (
    <img
      src={patch.thumbnail_url}
      alt={`Grass by ${patch.username}`}
      onError={() => setBroken(true)}
      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
    />
  )
}

export function MapPage() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ coords: [number, number]; zoom?: number } | null>(null)
  const [selected, setSelected] = useState<MapPatch | null>(null)
  const [showAccess, setShowAccess] = useState(false)
  const [cityParks, setCityParks] = useState(false)
  // GLOBAL shows everyone; MINE filters to the signed-in player's own patches.
  const [mineOnly, setMineOnly] = useState(false)
  const { user } = useSession()

  const patches = data?.patches ?? []
  const shown = mineOnly && user ? patches.filter((p) => p.username === user.username) : patches

  useEffect(() => {
    const load = () =>
      api
        .mapPatches()
        .then((next) => {
          setData(next)
          setError(null)
        })
        .catch((err: Error) => setError(err.message))

    void load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  const findMe = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This browser will not share your location.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setFocus({ coords: [pos.coords.latitude, pos.coords.longitude], zoom: 15 }),
      () => setError('Could not get your location. Showing Toronto.'),
      { timeout: 8000 },
    )
  }, [])

  return (
    <main className="fixed inset-x-0 top-0 bottom-14">
      <GrassMap
        center={data?.center ?? TORONTO}
        zoom={DEFAULT_ZOOM}
        patches={shown}
        focus={focus}
        onSelect={setSelected}
        showAccess={showAccess}
        cityParks={cityParks}
      />

      <div className="absolute top-4 left-4 right-4 z-[500] flex flex-col gap-3 max-w-xs pointer-events-none">
        <div className="bg-turf-800/95 backdrop-blur-sm chalk-border rounded-2xl p-4 pointer-events-auto">
          <h1 className="font-display text-2xl tracking-wide text-chalk leading-none">
            GRASS IN TORONTO
          </h1>
          <p className="text-chalk/60 text-sm mt-1.5 mb-3">
            {data ? (
              <>
                <span className="font-mono text-scoreboard font-bold text-lg">
                  {mineOnly ? shown.length : data.patch_count}
                </span>{' '}
                {mineOnly ? 'of your patches' : `patch${data.patch_count === 1 ? '' : 'es'} touched`}
              </>
            ) : (
              'Loading…'
            )}
          </p>

          {user && (
            <div className="flex rounded-lg border border-chalk/20 overflow-hidden mb-2">
              {([false, true] as const).map((mine) => (
                <button
                  key={String(mine)}
                  onClick={() => {
                    setMineOnly(mine)
                    // Whatever's open in the popup may no longer be on the map.
                    if (mine && selected && selected.username !== user.username) {
                      setSelected(null)
                    }
                  }}
                  aria-pressed={mineOnly === mine}
                  className={`flex-1 font-mono text-xs tracking-widest py-2 transition-colors ${
                    mineOnly === mine
                      ? 'bg-scoreboard text-turf-900 font-bold'
                      : 'text-chalk/70 hover:text-chalk'
                  }`}
                >
                  {mine ? 'MINE' : 'GLOBAL'}
                </button>
              ))}
            </div>
          )}
          {data?.patch_count === 0 && (
            <p className="text-chalk/50 text-xs leading-relaxed mb-3">
              No grass logged yet. Pins appear here once submissions come in with a location.
            </p>
          )}
          <button
            onClick={findMe}
            className="w-full border border-chalk/20 text-chalk/80 hover:text-chalk hover:border-chalk/40 font-mono text-xs tracking-widest py-2 rounded-lg transition-colors"
          >
            📍 NEAR ME
          </button>

          <button
            onClick={() => setShowAccess((on) => !on)}
            aria-pressed={showAccess}
            className={`mt-2 w-full font-mono text-xs tracking-widest py-2 rounded-lg transition-colors ${
              showAccess
                ? 'bg-scoreboard text-turf-900 font-bold'
                : 'border border-chalk/20 text-chalk/80 hover:text-chalk hover:border-chalk/40'
            }`}
          >
            🗺️ GREEN ACCESS
          </button>

          {showAccess && (
            <div className="mt-3 pt-3 border-t border-chalk/10">
              <button
                onClick={() => setCityParks((on) => !on)}
                aria-pressed={cityParks}
                className={`w-full font-mono text-xs tracking-widest py-2 rounded-lg transition-colors mb-3 ${
                  cityParks
                    ? 'bg-turf-500 text-turf-900 font-bold'
                    : 'border border-chalk/20 text-chalk/80 hover:text-chalk hover:border-chalk/40'
                }`}
              >
                🌳 DEMO MODE
              </button>

              <p className="text-chalk/70 text-[11px] leading-relaxed mb-2">
                {cityParks
                  ? "Every park in Toronto, plus what players logged, fading out over a 400 m walk."
                  : 'A 400 m walk around every patch of grass someone has logged.'}
              </p>
              <div
                className="h-2 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, #9aa19c 0%, #d8c860 34%, #9ccc51 67%, #1c7834 100%)',
                }}
              />
              <div className="flex justify-between mt-1 font-mono text-[9px] text-chalk/50">
                <span>EDGE OF REACH</span>
                <span>WELL SERVED</span>
              </div>

              {cityParks ? (
                <>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span
                      className="w-4 h-3 rounded-sm flex-shrink-0"
                      style={{ background: 'rgba(176,52,42,0.55)' }}
                    />
                    <span className="font-mono text-[9px] text-chalk/60">
                      NO GREEN SPACE WITHIN 400 m
                    </span>
                  </div>
                  <p className="text-chalk/40 text-[10px] leading-relaxed mt-2">
                    Park locations from OpenStreetMap. Red is a genuine gap — roughly a third of
                    the city.
                  </p>
                </>
              ) : (
                <p className="text-chalk/40 text-[10px] leading-relaxed mt-2">
                  Unshaded means no submissions yet — not necessarily no green space.
                </p>
              )}
            </div>
          )}
        </div>

        {selected && (
          <div className="relative bg-turf-800/95 backdrop-blur-sm chalk-border rounded-2xl p-4 pr-8 pointer-events-auto">
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-1.5 right-2.5 text-chalk/40 hover:text-chalk text-lg leading-none"
            >
              ×
            </button>
            <div className="flex gap-3 items-center">
              {/* A photo uploaded from a machine without the storage key lives on
                  that machine's disk — unreachable from here. The tuft stands in. */}
              <PopupThumb patch={selected} />
              <div className="min-w-0">
                <p className="text-chalk font-semibold text-sm truncate">
                  @{selected.username}
                  {selected.status === 'rejected' && (
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-dirt/50 text-dirt-light align-middle">
                      REJECTED
                    </span>
                  )}
                </p>
                {selected.status === 'rejected' ? (
                  <p className="text-dirt-light text-xs mt-0.5 line-clamp-2">
                    {selected.reject_reason ?? 'Not grass.'}
                  </p>
                ) : (
                  <p className="font-mono text-scoreboard text-xs mt-0.5">
                    {selected.total_score.toFixed(0)} pts
                  </p>
                )}
                <p className="text-chalk/40 text-[10px] mt-0.5">
                  {new Date(selected.submitted_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* The judge's signals. Vegetation quality is null on heuristic-judged
                rows — overall quality stands in so the row never looks broken. */}
            {selected.status === 'verified' && (
              <dl className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-chalk/10 text-center">
                <div>
                  <dt className="text-chalk/50 text-[9px] font-mono tracking-wide">VEGETATION</dt>
                  <dd className="font-mono text-chalk font-bold text-sm tabular-nums">
                    {(selected.vegetation_quality ?? selected.quality_score).toFixed(0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-chalk/50 text-[9px] font-mono tracking-wide">BIODIVERSITY</dt>
                  <dd className="font-mono text-chalk font-bold text-sm tabular-nums">
                    {selected.biodiversity === null ? '—' : selected.biodiversity.toFixed(0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-chalk/50 text-[9px] font-mono tracking-wide">COVERAGE</dt>
                  <dd className="font-mono text-chalk font-bold text-sm tabular-nums">
                    {(selected.grass_coverage * 100).toFixed(0)}%
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        {error && (
          <p
            className="bg-turf-800/95 backdrop-blur-sm chalk-border rounded-2xl p-3 text-dirt-light text-sm pointer-events-auto"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
