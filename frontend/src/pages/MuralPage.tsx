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
        .catch((err) => setError(err.message))

    void load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <main className="page">
      <h1 className="page__title">The shared patch</h1>
      <p className="card__hint">
        Every verified patch of grass, from every group, tiled into one field.
        {mural && ` ${mural.tile_count} tiles and counting.`}
      </p>
      {error && <p className="alert alert--error">{error}</p>}
      {mural && <MuralGrid mural={mural} />}
    </main>
  )
}
