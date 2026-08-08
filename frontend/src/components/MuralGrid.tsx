import type { Mural } from '../types'

/** The shared mural: every verified patch of grass, tiled into one field. */
export function MuralGrid({ mural }: { mural: Mural }) {
  if (mural.tile_count === 0) {
    return <p className="card__hint">The mural is bare dirt. Someone go outside.</p>
  }

  return (
    <div
      className="mural"
      style={{ gridTemplateColumns: `repeat(${mural.columns}, minmax(0, 1fr))` }}
    >
      {mural.tiles.map((tile) => (
        <figure
          key={tile.submission_id}
          className="mural__tile"
          style={{
            gridColumn: tile.x + 1,
            gridRow: tile.y + 1,
            backgroundColor: tile.dominant_color ?? '#2c4a2e',
          }}
        >
          <img src={tile.thumbnail_url} alt={`Grass by ${tile.username}`} loading="lazy" />
          <figcaption className="mural__caption">
            @{tile.username} · {tile.total_score.toFixed(0)}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
