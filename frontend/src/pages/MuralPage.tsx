import { useEffect, useState } from 'react'

import { api } from '../api/client'
import { MuralGrid } from '../components/MuralGrid'
import type { Mural } from '../types'

const REFRESH_MS = 20_000

export function MuralPage() {
  const [mural, setMural] = useState<Mural | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      api
        .mural()
        .then(setMural)
        .catch((err: Error) => setError(err.message))

    void load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <main className="min-h-screen pb-24 px-5 pt-8">
      <header className="mb-5">
        <p className="text-chalk/50 text-xs font-mono">EVERY GROUP, ONE FIELD</p>
        <h1 className="font-display text-3xl tracking-wide text-chalk leading-none mt-0.5">
          THE SHARED PATCH
        </h1>
        <p className="text-chalk/60 text-sm mt-2">
          Every verified patch of grass, tiled together.
          {mural && ` ${mural.tile_count} tiles and counting.`}
        </p>
      </header>

      {error && (
        <p className="text-dirt-light text-sm mb-4" role="alert">
          {error}
        </p>
      )}
      {mural && <MuralGrid mural={mural} />}
    </main>
  )
}
