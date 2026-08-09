export interface Coords {
  latitude: number
  longitude: number
}

/** Best-effort location, so the patch shows up on the map. Never blocks the upload. */
export async function currentCoords(): Promise<Coords | undefined> {
  if (!navigator.geolocation) return undefined
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 5000, enableHighAccuracy: true },
    )
  })
}

/**
 * Follows the player as they walk, for the capture screen's park compass.
 *
 * `watchPosition` rather than repeated one-shot reads: the browser keeps the
 * GPS warm and pushes updates as the fix improves, so the distance counts down
 * while you walk instead of freezing at whatever it was when the camera opened.
 *
 * Returns an unsubscribe. Silent on error — losing the fix mid-walk should
 * leave the last known position on screen, not blank the compass.
 */
export function watchCoords(onUpdate: (coords: Coords) => void): () => void {
  if (!navigator.geolocation) return () => {}
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
