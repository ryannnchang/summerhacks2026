import { useMemo, useState } from 'react'

import { useHeading } from '../hooks/useHeading'
import { compassPoint, formatDistance, nearestPark } from '../lib/nearestPark'
import { FACING_TOLERANCE, GroundArrow } from './GroundArrow'

interface Props {
  coords?: { latitude: number; longitude: number }
}

/**
 * Points at the nearest green space while the camera is open.
 *
 * With a compass the arrow rotates in real-world space — turn around and it
 * keeps pointing at the park. Without one (desktop, denied permission) it
 * degrades to a fixed compass bearing, which still tells you which way to walk.
 */
export function ParkCompass({ coords }: Props) {
  const { heading, pitch, permission, request } = useHeading()
  const [on, setOn] = useState(true)

  // The scan is cheap but not free, and the fix only changes when the browser
  // hands us a new one — no reason to redo it on every heading tick.
  const park = useMemo(
    () => (coords ? nearestPark(coords.latitude, coords.longitude) : null),
    [coords],
  )

  // Collapsed to a single tappable chip, so the viewfinder is clear but the
  // compass is one tap away rather than gone.
  if (!on) {
    return (
      <button
        onClick={() => setOn(true)}
        aria-label="Show the way to the nearest park"
        className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center bg-turf-900/80 backdrop-blur-sm rounded-full text-base"
      >
        🧭
      </button>
    )
  }

  // Say why there's no arrow rather than rendering nothing: silence here is
  // indistinguishable from the feature being broken.
  if (!coords || !park) {
    return (
      <div className="absolute top-3 left-3 right-3 flex items-center gap-3 bg-turf-900/80 backdrop-blur-sm rounded-xl px-3 py-2">
        <span className="text-base" aria-hidden>
          🧭
        </span>
        <p className="text-chalk/70 text-[10px] leading-tight flex-1">
          {!coords
            ? 'Waiting for your location — allow it to see the way to the nearest park.'
            : 'No park within 5 km. This only knows Toronto.'}
        </p>
        <button
          onClick={() => setOn(false)}
          aria-label="Hide the park compass"
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-chalk/70 hover:text-chalk text-sm leading-none"
        >
          ✕
        </button>
      </div>
    )
  }

  const oriented = heading !== null
  // Screen rotation: how far right of *where you're facing* the park sits.
  const rotation = oriented ? (park.bearing - heading + 360) % 360 : 0
  // Same angle, signed: negative means turn left, positive means turn right.
  const offBy = oriented ? ((park.bearing - heading + 540) % 360) - 180 : 0
  const facing = oriented && Math.abs(offBy) <= FACING_TOLERANCE

  return (
    <>
      {/* Only once you're pointed at it — an arrow that's always there is a
          compass; one that appears when you turn feels like it's in the street. */}
      {facing && <GroundArrow offBy={offBy} pitch={pitch} />}

    <div className="absolute top-3 left-3 right-3 flex items-center gap-3 bg-turf-900/80 backdrop-blur-sm rounded-xl px-3 py-2 pointer-events-none">
      <div
        className="w-9 h-9 flex-shrink-0 transition-transform duration-150 ease-out"
        style={{ transform: oriented ? `rotate(${rotation}deg)` : undefined }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="w-full h-full">
          <path d="M12 2 L19 20 L12 15.5 L5 20 Z" fill="#7AC74F" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-chalk text-sm font-bold leading-none">
          {formatDistance(park.metres)}
          {!oriented && <span className="text-chalk/70 font-normal"> · {compassPoint(park.bearing)}</span>}
        </p>
        {/* Off-target, say which way to turn — otherwise the ground arrow is
            missing and nothing explains why. */}
        <p className="text-chalk/70 text-[10px] leading-tight mt-0.5">
          {!oriented
            ? `nearest ${park.named ? 'park' : 'green space'}`
            : facing
              ? 'follow the arrows'
              : `turn ${offBy < 0 ? 'left' : 'right'} to find it`}
        </p>
      </div>

      {/* iOS won't hand over the compass without a tap, so ask for one. */}
      {permission === 'needed' && (
        <button
          onClick={() => void request()}
          className="pointer-events-auto flex-shrink-0 bg-scoreboard text-turf-900 font-mono text-[10px] tracking-widest px-2.5 py-1.5 rounded-lg"
        >
          AIM
        </button>
      )}

      <button
        onClick={() => setOn(false)}
        aria-label="Hide the park compass"
        className="pointer-events-auto flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-chalk/70 hover:text-chalk text-sm leading-none"
      >
        ✕
      </button>
      </div>
    </>
  )
}
