import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

import type { MapPatch } from '../types'

interface Props {
  center: [number, number]
  zoom: number
  patches: MapPatch[]
  /** Set this to fly somewhere — e.g. the visitor's own location. */
  focus?: { coords: [number, number]; zoom?: number } | null
  onSelect?: (patch: MapPatch) => void
}

/**
 * Leaflet wrapper.
 *
 * Pins are `divIcon`s rather than Leaflet's default marker, which sidesteps the classic bundler
 * problem where `marker-icon.png` resolves to a 404 and every pin renders invisible.
 */
export function GrassMap({ center, zoom, patches, focus, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pins = useRef<L.LayerGroup | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect

  // Build the map once. `center`/`zoom` seed the initial view; see the focus effect for changes.
  useEffect(() => {
    if (!container.current || map.current) return

    const instance = L.map(container.current, { zoomControl: false }).setView(center, zoom)
    L.control.zoom({ position: 'bottomright' }).addTo(instance)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(instance)

    map.current = instance
    pins.current = L.layerGroup().addTo(instance)

    return () => {
      instance.remove()
      map.current = null
      pins.current = null
    }
  }, [center, zoom])

  useEffect(() => {
    if (focus && map.current) map.current.flyTo(focus.coords, focus.zoom ?? 15)
  }, [focus])

  // Redraw pins whenever the data changes.
  useEffect(() => {
    const group = pins.current
    if (!group) return
    group.clearLayers()

    for (const patch of patches) {
      // Server-generated procedural SVG — better grass grows a bigger tuft.
      // Fallback dot covers rejected-glyph edge cases and very old rows.
      const size = 34 + Math.round((patch.quality_score / 100) * 14)
      const icon = patch.glyph_svg
        ? L.divIcon({
            className: 'grass-glyph',
            html: patch.glyph_svg,
            iconSize: [size, size],
            // Anchor at the tuft's base so the grass grows *out of* the geotag.
            iconAnchor: [size / 2, size - 3],
          })
        : L.divIcon({
            className: 'grass-pin',
            html: '<span class="grass-pin__dot"></span>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })

      L.marker([patch.latitude, patch.longitude], { icon, title: `@${patch.username}` })
        .bindPopup(
          `<figure class="pin-popup">
             <img src="${escapeAttr(patch.thumbnail_url)}" alt="Grass by ${escapeAttr(patch.username)}" />
             <figcaption>
               <strong>@${escapeAttr(patch.username)}</strong><br />
               ${patch.total_score.toFixed(0)} pts
             </figcaption>
           </figure>`,
        )
        .on('click', () => select.current?.(patch))
        .addTo(group)
    }
  }, [patches])

  return (
    <div
      className="absolute inset-0 bg-turf-900"
      ref={container}
      role="application"
      aria-label="Map of grass patches"
    />
  )
}

/** Usernames go into a popup as raw HTML, so escape them. */
function escapeAttr(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
