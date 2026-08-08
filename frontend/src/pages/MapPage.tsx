import { useCallback, useEffect, useState } from 'react'

import { api } from '../api/client'
import { GrassMap } from '../components/GrassMap'
import type { MapData, MapPatch } from '../types'

const TORONTO: [number, number] = [43.6532, -79.3832]
const DEFAULT_ZOOM = 12
const REFRESH_MS = 30_000

export function MapPage() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ coords: [number, number]; zoom?: number } | null>(null)
  const [selected, setSelected] = useState<MapPatch | null>(null)

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
    <main className="fixed inset-0 bottom-[49px]">
      <GrassMap
        center={data?.center ?? TORONTO}
        zoom={DEFAULT_ZOOM}
        patches={data?.patches ?? []}
        focus={focus}
        onSelect={setSelected}
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
                  {data.patch_count}
                </span>{' '}
                patch{data.patch_count === 1 ? '' : 'es'} touched
              </>
            ) : (
              'Loading…'
            )}
          </p>
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
        </div>

        {selected && (
          <div className="relative bg-turf-800/95 backdrop-blur-sm chalk-border rounded-2xl p-4 pr-8 flex gap-3 items-center pointer-events-auto">
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-1.5 right-2.5 text-chalk/40 hover:text-chalk text-lg leading-none"
            >
              ×
            </button>
            <img
              src={selected.thumbnail_url}
              alt={`Grass by ${selected.username}`}
              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-chalk font-semibold text-sm truncate">@{selected.username}</p>
              <p className="font-mono text-scoreboard text-xs mt-0.5">
                {selected.total_score.toFixed(0)} pts · quality {selected.quality_score.toFixed(0)}
              </p>
              <p className="text-chalk/40 text-[10px] mt-0.5">
                {new Date(selected.submitted_at).toLocaleString()}
              </p>
            </div>
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
