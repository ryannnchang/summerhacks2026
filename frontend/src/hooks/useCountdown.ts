import { useEffect, useState } from 'react'

/** Seconds left until `deadline`, ticking every second. Null when there's no deadline. */
export function useCountdown(deadline: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) {
      setRemaining(null)
      return
    }
    const target = new Date(deadline).getTime()
    const tick = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)))

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  return remaining
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
