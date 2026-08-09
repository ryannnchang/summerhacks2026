import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'

import { accessPoints, deadSpots, reachRadiusStops } from '../lib/greenAccess'
import type { MapPatch } from '../types'

interface Props {
  /** Leaflet-order [lat, lng], kept so callers didn't have to change. Mapbox wants the reverse. */
  center: [number, number]
  zoom: number
  patches: MapPatch[]
  /** Set this to fly somewhere — e.g. the visitor's own location. */
  focus?: { coords: [number, number]; zoom?: number } | null
  onSelect?: (patch: MapPatch) => void
  /** Overlays the green-space accessibility field. */
  showAccess?: boolean
  /**
   * Folds the city's ~2,900 parks into the field and marks the gaps. Turns a
   * sparse map of submissions into a claim about the whole city.
   */
  cityParks?: boolean
}

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const SOURCE = 'patches'
/**
 * Three or more photos in one radius collapse into a tile.
 *
 * Worth knowing what this trades off: real submissions land within a few metres of each other —
 * a group photographs the same lawn — which at zoom 12 is under a pixel of separation. So a pair
 * that falls below this threshold renders as a single visible pin with the other hidden directly
 * underneath it, until you zoom to roughly 20.
 */
const CLUSTER_MIN_POINTS = 3
const CLUSTER_RADIUS = 70

const ACCESS_SOURCE = 'green-access'
const ACCESS_LAYER = 'green-access-heat'
const DEAD_SOURCE = 'green-deserts'
const DEAD_LAYER = 'green-deserts-fill'

/**
 * Mapbox GL wrapper.
 *
 * Pins are the submitted photos themselves, bordered by score. They're DOM markers rather than a
 * symbol layer because a thumbnail with a coloured ring, a score chip and a hover state is far
 * cheaper to express in CSS than in a paint spec.
 *
 * Clustering still needs a real GeoJSON source (that's where supercluster lives), so the source
 * carries the points, an invisible circle layer forces its tiles to load, and the markers are
 * synced from whatever that source currently reports. This is Mapbox's documented approach for
 * HTML markers on a clustered source.
 */
export function GrassMap({
  center,
  zoom,
  patches,
  focus,
  onSelect,
  showAccess,
  cityParks,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const centered = useRef(false)
  const [ready, setReady] = useState(false)

  // Markers are keyed so a re-sync reuses the existing DOM instead of tearing every pin down —
  // rebuilding them each frame restarts the CSS pop animation and flickers the thumbnails.
  const markers = useRef<Record<string, mapboxgl.Marker>>({})
  const onScreen = useRef<Record<string, mapboxgl.Marker>>({})

  const byId = useRef<Map<number, MapPatch>>(new Map())
  byId.current = new Map(patches.map((p) => [p.submission_id, p]))

  const select = useRef(onSelect)
  select.current = onSelect

  // Build the map once. `center`/`zoom` seed the initial view; see the focus effect for changes.
  useEffect(() => {
    if (!container.current || map.current) return

    if (!mapboxgl.accessToken) {
      console.error('Missing VITE_MAPBOX_TOKEN — the map will render blank.')
    }

    const instance = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [center[1], center[0]],
      zoom,
      attributionControl: true,
    })

    instance.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    instance.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'bottom-right',
    )

    instance.on('load', () => {
      // Accessibility choropleth. Added before the patch source so it always
      // paints underneath, and starts hidden until the toggle asks for it.
      instance.addSource(ACCESS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Slot it into the basemap's own layer stack, underneath the roads, so
      // streets, parks and labels all draw on top of the colour. Painting it
      // last (the default) buries the city under a sheet of fill and the map
      // stops being a map. Falls back to the first label layer, then to the
      // top, if this style ever stops having road layers.
      const styleLayers = instance.getStyle()?.layers ?? []
      const beforeId =
        styleLayers.find(
          (l) => l.type === 'line' && 'source-layer' in l && l['source-layer'] === 'road',
        )?.id ??
        styleLayers.find((l) => l.id.startsWith('road'))?.id ??
        styleLayers.find((l) => l.type === 'symbol')?.id

      // Green deserts sit below the heat so a sliver of served ground inside a
      // gap still reads green rather than being covered by the desert fill.
      instance.addSource(DEAD_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instance.addLayer(
        {
          id: DEAD_LAYER,
          type: 'fill',
          source: DEAD_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            // Red is earned here, unlike over the submissions-only field: with
            // every park in the city accounted for, blank ground is a real gap,
            // not missing data.
            'fill-color': '#b0342a',
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 14, 0.4],
            'fill-antialias': false,
          },
        },
        beforeId,
      )

      const [near, far] = reachRadiusStops(center[0])

      instance.addLayer(
        {
          id: ACCESS_LAYER,
          type: 'heatmap',
          source: ACCESS_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'heatmap-weight': ['get', 'weight'],
            // Radius is in screen pixels, so it must be re-derived per zoom to
            // hold 400 m on the ground. Base 2 matches Web Mercator's doubling.
            'heatmap-radius': [
              'interpolate',
              ['exponential', 2],
              ['zoom'],
              near.zoom, near.pixels,
              far.zoom, far.pixels,
            ],
            // Kept near 1 so overlapping catchments accumulate honestly rather
            // than saturating the moment two patches are near each other.
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 16, 1.2],
            // Fully transparent at zero: ground with no evidence shows the
            // plain basemap instead of being painted a colour that would imply
            // a finding. Colour only ever means "green space was found here".
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.08, 'rgba(154,161,156,0.25)', // the faint outer edge of one patch
              0.3, 'rgba(216,200,96,0.45)',
              0.55, 'rgba(156,204,81,0.60)',
              0.8, 'rgba(63,163,77,0.72)',
              1, 'rgba(28,120,52,0.82)', // several patches, same short walk
            ],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.75, 16, 0.9],
          },
        },
        beforeId,
      )

      instance.addSource(SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: 17,
        clusterMinPoints: CLUSTER_MIN_POINTS,
        // Summed here so a cluster's ring can show the average without fetching its leaves.
        clusterProperties: { sumQuality: ['+', ['get', 'quality']] },
      })

      // querySourceFeatures only sees tiles that something has caused to load, so the source
      // needs a layer even though every pin is drawn as DOM.
      instance.addLayer({
        id: `${SOURCE}-probe`,
        type: 'circle',
        source: SOURCE,
        paint: { 'circle-radius': 1, 'circle-opacity': 0 },
      })

      setReady(true)
    })

    map.current = instance

    return () => {
      for (const marker of Object.values(markers.current)) marker.remove()
      markers.current = {}
      onScreen.current = {}
      instance.remove()
      map.current = null
      setReady(false)
    }
    // Mount-only: re-running this would tear down the map on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (focus && map.current) {
      map.current.flyTo({ center: [focus.coords[1], focus.coords[0]], zoom: focus.zoom ?? 15 })
    }
  }, [focus])

  // `center` starts as a client-side placeholder and is replaced once the server responds.
  // Applied once, and never over a user-driven focus, so the 30s refresh can't yank the view back.
  useEffect(() => {
    if (!map.current || !ready || centered.current || focus) return
    centered.current = true
    map.current.jumpTo({ center: [center[1], center[0]] })
  }, [center, ready, focus])

  // Push new data into the source. Supercluster re-buckets, and the render handler below
  // reconciles the DOM markers against the result.
  useEffect(() => {
    const instance = map.current
    if (!instance || !ready) return

    const source = instance.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    source.setData({
      type: 'FeatureCollection',
      features: patches.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
        properties: { id: p.submission_id, quality: p.quality_score },
      })),
    })
  }, [patches, ready])

  // Catchment circles are geometry around fixed points, so unlike the old grid
  // they don't depend on the viewport and never need rebuilding on pan or zoom.
  useEffect(() => {
    const instance = map.current
    if (!instance || !ready) return

    instance.setLayoutProperty(ACCESS_LAYER, 'visibility', showAccess ? 'visible' : 'none')
    instance.setLayoutProperty(DEAD_LAYER, 'visibility', showAccess && cityParks ? 'visible' : 'none')
    if (!showAccess) return

    const heat = instance.getSource(ACCESS_SOURCE) as mapboxgl.GeoJSONSource | undefined
    heat?.setData(accessPoints(patches, cityParks))

    if (!cityParks) return
    // ~13k cells against ~2.9k sources. Deferred a frame so the heat layer
    // paints immediately instead of the whole toggle waiting on the sweep.
    const deferred = window.setTimeout(() => {
      const deserts = instance.getSource(DEAD_SOURCE) as mapboxgl.GeoJSONSource | undefined
      deserts?.setData(deadSpots(patches))
    }, 0)
    return () => window.clearTimeout(deferred)
  }, [showAccess, cityParks, patches, ready])

  useEffect(() => {
    const instance = map.current
    if (!instance || !ready) return

    const sync = () => {
      if (!instance.isSourceLoaded(SOURCE)) return

      const source = instance.getSource(SOURCE) as mapboxgl.GeoJSONSource
      const features = instance.querySourceFeatures(SOURCE)
      const next: Record<string, mapboxgl.Marker> = {}

      for (const feature of features) {
        if (feature.geometry.type !== 'Point') continue
        const coords = feature.geometry.coordinates as [number, number]
        const props = feature.properties ?? {}
        const key = props.cluster ? `c${props.cluster_id}` : `p${props.id}`

        // querySourceFeatures returns duplicates across tile boundaries.
        if (next[key]) continue

        let marker = markers.current[key]
        if (!marker) {
          const el = props.cluster
            ? clusterElement(instance, source, props, coords)
            : patchElement(byId.current.get(props.id as number))
          if (!el) continue
          marker = new mapboxgl.Marker({ element: el }).setLngLat(coords)
          markers.current[key] = marker
        }

        next[key] = marker
        if (!onScreen.current[key]) marker.addTo(instance)
      }

      for (const [key, marker] of Object.entries(onScreen.current)) {
        if (!next[key]) {
          marker.remove()
          // Clusters are re-bucketed on every zoom, so their ids churn; dropping the cached
          // element keeps this map from growing without bound over a long session.
          if (key.startsWith('c')) delete markers.current[key]
        }
      }
      onScreen.current = next
    }

    instance.on('render', sync)
    return () => {
      instance.off('render', sync)
    }
  }, [ready])

  /** A cluster: the member tufts drawn together as one clump, with a count badge. */
  function clusterElement(
    instance: mapboxgl.Map,
    source: mapboxgl.GeoJSONSource,
    props: Record<string, unknown>,
    coords: [number, number],
  ): HTMLElement {
    const count = props.point_count as number
    const average = (props.sumQuality as number) / count

    const el = document.createElement('div')
    el.className = 'patch-cluster'
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.setAttribute('aria-label', `${count} grass patches here. Activate to zoom in.`)
    // A denser cluster grows a wider clump, but with a ceiling so a big city
    // block doesn't swallow the map.
    const width = Math.min(76 + count * 7, 128)
    el.style.width = `${width}px`
    el.style.height = '80px'

    // Mapbox positions a marker by writing a transform onto this root element. A CSS animation
    // or hover rule touching `transform` outranks that inline style and strands every pin at the
    // map's top-left corner, so everything that moves lives on an inner wrapper instead.
    const inner = document.createElement('div')
    inner.className = 'patch-cluster__inner'
    inner.style.setProperty('--ring', scoreColor(average))
    el.appendChild(inner)

    const stack = document.createElement('div')
    stack.className = 'patch-cluster__stack'
    inner.appendChild(stack)

    const badge = document.createElement('span')
    badge.className = 'patch-cluster__count'
    badge.textContent = String(count)
    inner.appendChild(badge)

    // Leaves are only available asynchronously; the clump renders empty and fills in.
    // Up to six tufts are planted along one baseline, overlapping, so a cluster
    // reads as a denser patch of the same grass rather than a stack of photos.
    const MAX_TUFTS = 6
    source.getClusterLeaves(props.cluster_id as number, MAX_TUFTS, 0, (err, leaves) => {
      if (err || !leaves) return
      const patches = leaves
        .map((leaf) => byId.current.get(leaf.properties?.id as number))
        .filter((p): p is MapPatch => Boolean(p?.glyph_svg))
      if (patches.length === 0) return

      // Tallest in the middle, shorter ones to the outside — a natural clump
      // silhouette instead of a random skyline.
      const ordered = [...patches].sort((a, b) => a.quality_score - b.quality_score)
      const arranged: MapPatch[] = []
      ordered.forEach((patch, i) => (i % 2 ? arranged.unshift(patch) : arranged.push(patch)))

      arranged.forEach((patch, i) => {
        const tuft = document.createElement('div')
        tuft.className = 'patch-cluster__tuft'
        tuft.innerHTML = patch.glyph_svg as string
        // Spread is deliberately narrow: the tufts must overlap heavily, or the
        // clump reads as several separate plants instead of one patch.
        const spread = arranged.length > 1 ? i / (arranged.length - 1) : 0.5
        tuft.style.left = `${24 + spread * 52}%`
        tuft.style.width = `${64 + (patch.quality_score / 100) * 30}%`
        // Back tufts sit slightly higher and dimmer, for a shallow depth cue.
        const depth = Math.abs(spread - 0.5) * 2
        tuft.style.bottom = `${depth * 12}%`
        tuft.style.opacity = String(1 - depth * 0.25)
        tuft.style.zIndex = String(10 - Math.round(depth * 10))
        stack.appendChild(tuft)
      })
    })

    const expand = () => {
      source.getClusterExpansionZoom(props.cluster_id as number, (err, expansionZoom) => {
        if (err || expansionZoom == null) return
        inner.classList.add('is-expanding')
        instance.easeTo({
          center: coords,
          // A touch past the split point, so the photos land clearly apart rather than
          // re-clustering at the boundary.
          zoom: expansionZoom + 0.4,
          duration: 700,
          essential: true,
        })
      })
    }

    el.addEventListener('click', expand)
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        expand()
      }
    })

    return el
  }

  /** A single submission: its photo, ringed and chipped by score. */
  function patchElement(patch: MapPatch | undefined): HTMLElement | null {
    if (!patch) return null

    const size = 64 + Math.round((patch.quality_score / 100) * 32)
    const el = document.createElement('div')
    el.className = 'patch-marker'
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.setAttribute(
      'aria-label',
      `Grass by ${patch.username}, ${patch.quality_score.toFixed(0)} quality`,
    )

    // See clusterElement: the root belongs to Mapbox's transform, so the ring, the pop-in and
    // the hover scale all live one level down.
    const inner = document.createElement('div')
    inner.className = 'patch-marker__inner'
    inner.style.setProperty('--ring', scoreColor(patch.quality_score))
    el.appendChild(inner)

    // The tuft *is* the pin — no card, no photo. The photo is one click away in
    // the popup, and a glyph never 404s the way a cross-device upload can.
    if (patch.glyph_svg) {
      const glyph = document.createElement('div')
      glyph.className = 'patch-marker__glyph'
      glyph.innerHTML = patch.glyph_svg
      inner.appendChild(glyph)
    } else {
      // Pre-glyph rows still need something clickable.
      const img = document.createElement('img')
      img.src = patch.thumbnail_url
      img.alt = `Grass by ${patch.username}`
      img.loading = 'lazy'
      inner.appendChild(img)
    }

    const open = () => select.current?.(patch)
    el.addEventListener('click', open)
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open()
      }
    })

    return el
  }

  return (
    <div
      className="absolute inset-0 bg-turf-900"
      ref={container}
      role="application"
      aria-label="Map of grass patches"
    />
  )
}

/** The prototype's ramp: red at 0, amber at 50, green at 100. */
function scoreColor(score: number, alpha = 1): string {
  const [r, g, b] =
    score >= 50
      ? mix('#f4d03f', '#2ecc71', (score - 50) / 50)
      : mix('#e74c3c', '#f4d03f', Math.max(score, 0) / 50)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function mix(from: string, to: string, t: number): [number, number, number] {
  const clamped = Math.min(Math.max(t, 0), 1)
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const at = (i: number) =>
    Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * clamped)
  return [at(0), at(1), at(2)]
}
