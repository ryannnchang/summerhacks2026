import { torontoParks } from '../data/torontoParks'

/**
 * Nearest green space to a coordinate, for the capture screen's compass.
 *
 * Reuses the park dataset already bundled for the map's accessibility overlay,
 * so this costs no extra download and no network call — it works with the
 * camera open and the signal poor, which is exactly when you need it.
 */

const METRES_PER_DEG_LAT = 111_320

/** Past this, the answer is noise — you're outside the city the data covers. */
const MAX_USEFUL_METRES = 5000

export interface NearbyPark {
  lat: number
  lng: number
  /** Straight-line metres, not walking distance. */
  metres: number
  /** Compass bearing from the player to the park, 0-360 clockwise from north. */
  bearing: number
  /** Named parks are real destinations; the rest are parkettes and greens. */
  named: boolean
}

function bearingTo(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLng = toRad(toLng - fromLng)
  const y = Math.sin(dLng) * Math.cos(toRad(toLat))
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

export function nearestPark(lat: number, lng: number): NearbyPark | null {
  const lngScale = Math.cos((lat * Math.PI) / 180)
  let best: NearbyPark | null = null

  // A linear scan over ~2.9k points is well under a millisecond, and avoids
  // shipping a spatial index for a lookup that runs once per capture.
  for (const park of torontoParks()) {
    const dLat = (park.lat - lat) * METRES_PER_DEG_LAT
    const dLng = (park.lng - lng) * METRES_PER_DEG_LAT * lngScale
    const metres = Math.hypot(dLat, dLng)
    if (best && metres >= best.metres) continue
    best = { lat: park.lat, lng: park.lng, metres, bearing: 0, named: park.named }
  }

  if (!best || best.metres > MAX_USEFUL_METRES) return null
  best.bearing = bearingTo(lat, lng, best.lat, best.lng)
  return best
}

/** "40 m", "320 m", "1.4 km" — distance as a player reads it. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`
  return `${(metres / 1000).toFixed(1)} km`
}

/** Rough compass point, for when the device has no heading to rotate by. */
export function compassPoint(bearing: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return points[Math.round(bearing / 45) % 8]
}
