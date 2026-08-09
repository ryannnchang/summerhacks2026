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
      // Coarse and cache-friendly: a submission's coordinates only need to say
      // which park you were in, and a 5s high-accuracy wait was timing out
      // indoors and tagging photos with no location at all.
      { timeout: 10_000, enableHighAccuracy: false, maximumAge: 60_000 },
    )
  })
}

/**
 * Why we have no position — so the UI can say "allow location" rather than
 * leaving a spinner that means nothing.
 */
export type GeoStatus = 'pending' | 'ok' | 'denied' | 'unavailable'

/**
 * Follows the player as they walk, for the capture screen's park compass.
 *
 * `watchPosition` rather than repeated one-shot reads: the browser keeps the
 * GPS warm and pushes updates as the fix improves, so the distance counts down
 * while you walk instead of freezing at whatever it was when the camera opened.
 *
 * A failure *after* a good fix isn't reported — losing signal mid-walk should
 * leave the last known position on screen rather than blanking the compass.
 */
export function watchCoords(
  onUpdate: (coords: Coords) => void,
  onStatus?: (status: GeoStatus) => void,
): () => void {
  if (!navigator.geolocation) {
    onStatus?.('unavailable')
    return () => {}
  }
  let everFixed = false

  const accept = (pos: GeolocationPosition) => {
    everFixed = true
    onStatus?.('ok')
    onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
  }

  // Coarse fix first. `enableHighAccuracy` waits on a real GPS lock, which
  // indoors takes tens of seconds or never arrives — the wifi/cell estimate is
  // accurate to a block or so and usually returns instantly, which is plenty to
  // name the nearest park. A generous maximumAge lets a cached fix answer at
  // once rather than powering the radio up at all.
  navigator.geolocation.getCurrentPosition(
    accept,
    (err) => {
      if (!everFixed && err.code === err.PERMISSION_DENIED) onStatus?.('denied')
    },
    { enableHighAccuracy: false, maximumAge: 600_000, timeout: 12_000 },
  )

  // Then keep a precise watch running to refine it and follow the walk. No
  // timeout: a watch that gives up is worse than one that reports late.
  const id = navigator.geolocation.watchPosition(
    accept,
    (err) => {
      if (everFixed) return
      onStatus?.(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
    },
    { enableHighAccuracy: true, maximumAge: 5000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
