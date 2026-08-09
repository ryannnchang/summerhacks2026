/**
 * Chevrons on the ground, pointing the way to the park.
 *
 * Not real 3D — a CSS `perspective` + `rotateX` lays a flat stack of chevrons
 * down onto the ground plane, and they flow away from the viewer. That reads as
 * depth without a WebGL scene, and it costs nothing on a phone that's already
 * running a camera stream.
 *
 * It only appears when you're actually facing the park, which is the point: an
 * arrow that's always on screen is a compass, but one that appears when you
 * turn the right way feels like it's really out there in the street.
 */

interface Props {
  /** Signed degrees the park sits off your facing: negative left, positive right. */
  offBy: number
  /** Device pitch (DeviceOrientation beta). Keeps the chevrons flat as you tilt. */
  pitch: number | null
}

/** How far off you can be and still count as facing it. */
export const FACING_TOLERANCE = 28

export function GroundArrow({ offBy, pitch }: Props) {
  // Phone held upright is beta ~90; lowering it toward the ground reduces beta.
  // Mapping that onto the plane tilt keeps the chevrons lying on the pavement
  // instead of swinging with the phone. Clamped so extremes stay sensible.
  const tilt = pitch === null ? 64 : Math.min(78, Math.max(45, 90 - (90 - pitch) * 0.7))

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center"
      style={{ perspective: '260px' }}
      aria-hidden
    >
      <div
        className="relative w-28 h-32 transition-transform duration-150 ease-out"
        style={{ transform: `rotateX(${tilt}deg) rotateZ(${offBy}deg)`, transformStyle: 'preserve-3d' }}
      >
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 40 20"
            className="chevron-flow absolute left-0 w-28"
            style={{ top: `${i * 34}px`, animationDelay: `${i * 0.6}s` }}
          >
            <path
              d="M2 18 L20 3 L38 18 L30 18 L20 10.5 L10 18 Z"
              fill="#7AC74F"
              stroke="rgba(11,24,8,0.45)"
              strokeWidth="1"
            />
          </svg>
        ))}
      </div>
    </div>
  )
}
