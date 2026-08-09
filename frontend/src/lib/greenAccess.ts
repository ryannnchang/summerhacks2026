import { torontoParks } from '../data/torontoParks'
import { TORONTO_BBOX, insideToronto } from './torontoBoundary'
import type { MapPatch } from '../types'

/**
 * Urban green-space accessibility, as a field that falls off with distance.
 *
 * Every verified patch is evidence that green space exists at that point, and
 * that evidence weakens the further you walk from it — reaching nothing at
 * REACH_METRES. Overlapping catchments add up, so a neighbourhood with several
 * patches within a few minutes' walk reads stronger than one with a lone park.
 *
 * Rendered as a Mapbox heatmap rather than polygons: the falloff is genuinely
 * continuous, where rings or a grid would band. Ground with no evidence is left
 * unpainted — "nobody has submitted here" is not the same claim as "no grass
 * here", so it stays basemap grey rather than being coloured a warning colour.
 *
 * This is a proxy, not a survey: it can only see places somebody has played in.
 */

/** How far a patch's influence reaches before it fades to nothing. */
export const REACH_METRES = 400

const METRES_PER_DEG_LAT = 111_320

/** Equirectangular distance — plenty at city scale, and far cheaper than haversine. */
function metresBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  lngScale: number,
): number {
  const dLat = (aLat - bLat) * METRES_PER_DEG_LAT
  const dLng = (aLng - bLng) * METRES_PER_DEG_LAT * lngScale
  return Math.hypot(dLat, dLng)
}

/** Rejected photos are dead grass — they mark the map, but prove no green space. */
function weightFor(patch: MapPatch): number {
  if (patch.status === 'rejected') return 0
  // A lusher patch counts for a little more, but every verified patch counts:
  // the floor keeps a scruffy verified lawn from vanishing entirely.
  return 0.55 + Math.min(patch.quality_score, 100) / 100 * 0.45
}

export interface AccessPoint {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { weight: number }
}

/**
 * The weighted points the heatmap integrates over.
 *
 * `withParks` folds in the city's parks alongside the submissions. That changes
 * what the map means, so it's a deliberate switch rather than a default: with
 * submissions alone, blank ground means "nobody has played here"; with the park
 * layer, the city's green space is all accounted for, and blank ground becomes
 * a real finding about access.
 */
export function accessPoints(
  patches: MapPatch[],
  withParks = false,
): { type: 'FeatureCollection'; features: AccessPoint[] } {
  const features: AccessPoint[] = []

  for (const patch of patches) {
    const weight = weightFor(patch)
    if (weight <= 0) continue
    // A patch outside the city would drag the story somewhere it can't support.
    if (!insideToronto(patch.longitude, patch.latitude)) continue

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [patch.longitude, patch.latitude] },
      properties: { weight },
    })
  }

  if (withParks) {
    for (const park of torontoParks()) {
      // The dataset carries a couple of out-of-city points for testing the
      // capture compass; the overlay's claim is about Toronto, so they're
      // filtered here rather than left to bloom outside the city.
      if (!insideToronto(park.lng, park.lat)) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [park.lng, park.lat] },
        // A named park is a destination; a parkette is a nice-to-have.
        properties: { weight: park.named ? 0.9 : 0.5 },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

/** Cell size for the dead-spot sweep — ~220 m, fine enough to trace gaps. */
const DEAD_CELL_DEG = 0.002

export interface DeadCell {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: [number, number][][] }
  properties: Record<string, never>
}

/**
 * Ground inside Toronto with no green space within REACH_METRES.
 *
 * Only meaningful with the park layer on — against submissions alone this would
 * flag most of the city, and say nothing except that the game is new.
 *
 * Sources are bucketed into a hash grid first: a naive sweep is ~16k cells
 * against ~2.9k parks, 46M distance checks, which visibly hangs the tab.
 */
export function deadSpots(patches: MapPatch[]): {
  type: 'FeatureCollection'
  features: DeadCell[]
} {
  const lngScale = Math.cos((43.7 * Math.PI) / 180)
  const reachLat = REACH_METRES / METRES_PER_DEG_LAT
  const reachLng = reachLat / lngScale

  // Bucket edge = the reach itself, so only the 3x3 neighbourhood can matter.
  const buckets = new Map<string, [number, number][]>()
  const key = (lng: number, lat: number) =>
    `${Math.floor(lng / reachLng)}:${Math.floor(lat / reachLat)}`

  const add = (lng: number, lat: number) => {
    const k = key(lng, lat)
    const bucket = buckets.get(k)
    if (bucket) bucket.push([lng, lat])
    else buckets.set(k, [[lng, lat]])
  }

  for (const park of torontoParks()) add(park.lng, park.lat)
  for (const patch of patches) {
    if (weightFor(patch) > 0) add(patch.longitude, patch.latitude)
  }

  const served = (lng: number, lat: number): boolean => {
    const bx = Math.floor(lng / reachLng)
    const by = Math.floor(lat / reachLat)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = buckets.get(`${bx + dx}:${by + dy}`)
        if (!bucket) continue
        for (const [plng, plat] of bucket) {
          if (metresBetween(lat, lng, plat, plng, lngScale) <= REACH_METRES) return true
        }
      }
    }
    return false
  }

  const features: DeadCell[] = []
  const cellLng = DEAD_CELL_DEG / lngScale

  for (let lat = TORONTO_BBOX.south; lat < TORONTO_BBOX.north; lat += DEAD_CELL_DEG) {
    for (let lng = TORONTO_BBOX.west; lng < TORONTO_BBOX.east; lng += cellLng) {
      const cLat = lat + DEAD_CELL_DEG / 2
      const cLng = lng + cellLng / 2
      if (!insideToronto(cLng, cLat)) continue
      if (served(cLng, cLat)) continue

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lng, lat],
              [lng + cellLng, lat],
              [lng + cellLng, lat + DEAD_CELL_DEG],
              [lng, lat + DEAD_CELL_DEG],
              [lng, lat],
            ],
          ],
        },
        properties: {} as Record<string, never>,
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

/**
 * Heatmap radius stops, in pixels, that hold REACH_METRES steady on the ground.
 *
 * A heatmap radius is expressed in screen pixels, so it has to be re-derived
 * per zoom or the catchment silently grows as you zoom in. Web Mercator halves
 * the ground distance per pixel at each level, which is exactly what an
 * exponential-base-2 interpolation between two stops reproduces.
 */
export function reachRadiusStops(atLatitude: number): { zoom: number; pixels: number }[] {
  const groundResolutionAtZoom0 = 156_543.03 * Math.cos((atLatitude * Math.PI) / 180)
  const pixelsAt = (zoom: number) => (REACH_METRES * 2 ** zoom) / groundResolutionAtZoom0
  return [
    { zoom: 9, pixels: pixelsAt(9) },
    { zoom: 18, pixels: pixelsAt(18) },
  ]
}
