import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Device compass heading, in degrees clockwise from true north.
 *
 * Three platforms, three behaviours:
 *
 *  - iOS 13+ exposes `webkitCompassHeading` (already true-north referenced) but
 *    only after `requestPermission()` is granted from a user gesture, which is
 *    why `request` exists rather than this just working on mount.
 *  - Android/Chrome fires `deviceorientationabsolute` with `alpha` measured
 *    anticlockwise from north, hence `360 - alpha`.
 *  - Desktop has no magnetometer at all, so `heading` stays null and callers
 *    fall back to showing a compass bearing instead of rotating an arrow.
 *
 * Readings are smoothed: a raw magnetometer jitters several degrees a frame,
 * which reads as a twitching arrow.
 */

type PermissionState = 'unknown' | 'needed' | 'granted' | 'denied' | 'unsupported'

interface DeviceOrientationEventIOS {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function useHeading(): {
  heading: number | null
  /** Device pitch in degrees (90 = held upright). Null until a reading lands. */
  pitch: number | null
  permission: PermissionState
  request: () => Promise<void>
} {
  const [heading, setHeading] = useState<number | null>(null)
  const [pitch, setPitch] = useState<number | null>(null)
  const [permission, setPermission] = useState<PermissionState>('unknown')
  const smoothed = useRef<number | null>(null)

  const handle = useCallback((event: DeviceOrientationEvent) => {
    if (typeof event.beta === 'number') setPitch(event.beta)
    const iosHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading
    let next: number | null = null

    if (typeof iosHeading === 'number' && !Number.isNaN(iosHeading)) {
      next = iosHeading
    } else if (typeof event.alpha === 'number') {
      // `absolute` events are true-north referenced and preferred, but plenty
      // of Android browsers only ever fire the relative one — and Chrome's
      // DevTools sensor emulation likewise reports absolute:false. Taking alpha
      // either way means those devices get an arrow instead of nothing; the
      // relative case can be rotated from north, which is a wrong heading, but
      // a wrong heading is recoverable by turning and a missing one is not.
      next = (360 - event.alpha) % 360
    }
    if (next === null) return

    // Circular smoothing: averaging 359° and 1° naively gives 180°, so blend
    // along the shorter arc instead.
    const previous = smoothed.current
    if (previous === null) {
      smoothed.current = next
    } else {
      let delta = ((next - previous + 540) % 360) - 180
      smoothed.current = (previous + delta * 0.25 + 360) % 360
    }
    setHeading(smoothed.current)
  }, [])

  const listen = useCallback(() => {
    // 'deviceorientationabsolute' is the Android path; iOS only fires the plain
    // event, but its readings are already absolute via webkitCompassHeading.
    window.addEventListener('deviceorientationabsolute', handle as EventListener)
    window.addEventListener('deviceorientation', handle as EventListener)
  }, [handle])

  const request = useCallback(async () => {
    const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS | undefined
    if (!ctor) {
      setPermission('unsupported')
      return
    }
    if (typeof ctor.requestPermission !== 'function') {
      setPermission('granted') // Android and desktop need no prompt
      listen()
      return
    }
    try {
      const result = await ctor.requestPermission()
      setPermission(result === 'granted' ? 'granted' : 'denied')
      if (result === 'granted') listen()
    } catch {
      setPermission('denied')
    }
  }, [listen])

  useEffect(() => {
    const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS | undefined
    if (!ctor) {
      setPermission('unsupported')
      return
    }
    if (typeof ctor.requestPermission === 'function') {
      // iOS: wait for the gesture-triggered request().
      setPermission('needed')
      return
    }
    setPermission('granted')
    listen()
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle as EventListener)
      window.removeEventListener('deviceorientation', handle as EventListener)
    }
  }, [handle, listen])

  useEffect(
    () => () => {
      window.removeEventListener('deviceorientationabsolute', handle as EventListener)
      window.removeEventListener('deviceorientation', handle as EventListener)
    },
    [handle],
  )

  return { heading, pitch, permission, request }
}
