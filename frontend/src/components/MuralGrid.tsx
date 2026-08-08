import type { Mural } from '../types'

/** The shared mural: every verified patch of grass, tiled into one field. */
export function MuralGrid({ mural }: { mural: Mural }) {
  if (mural.tile_count === 0) {
    return (
      <p className="text-chalk/50 text-sm chalk-border rounded-xl p-4 text-center">
        The mural is bare dirt. Someone go outside.
      </p>
    )
  }

  return (
    <div
      className="grid gap-[3px] rounded-2xl overflow-hidden chalk-border-solid"
      style={{ gridTemplateColumns: `repeat(${mural.columns}, minmax(0, 1fr))` }}
    >
      {mural.tiles.map((tile) => (
        <figure
          key={tile.submission_id}
          className="group relative m-0 aspect-square overflow-hidden"
          style={{
            gridColumn: tile.x + 1,
            gridRow: tile.y + 1,
            backgroundColor: tile.dominant_color ?? '#2D5A27',
          }}
        >
          <img
            src={tile.thumbnail_url}
            alt={`Grass by ${tile.username}`}
            loading="lazy"
            className="w-full h-full object-cover block"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent text-chalk font-mono text-[9px] px-1 pt-3 pb-0.5 truncate opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            @{tile.username} · {tile.total_score.toFixed(0)}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
