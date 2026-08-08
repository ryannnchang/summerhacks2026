/** Best-effort location, so the patch shows up on the map. Never blocks the upload. */
export async function currentCoords(): Promise<
  { latitude: number; longitude: number } | undefined
> {
  if (!navigator.geolocation) return undefined
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 5000, enableHighAccuracy: true },
    )
  })
}
