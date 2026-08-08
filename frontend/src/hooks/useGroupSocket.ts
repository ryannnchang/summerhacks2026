import { useEffect, useRef, useState } from 'react'

import { groupSocketUrl } from '../api/client'
import type { GroupEvent } from '../types'

const HEARTBEAT_MS = 25_000
const RECONNECT_MS = 3_000

/** Subscribes to a group's live feed. Reconnects on drop. */
export function useGroupSocket(groupId: number | null, onEvent: (event: GroupEvent) => void) {
  const [connected, setConnected] = useState(false)
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (groupId === null) return

    let socket: WebSocket | null = null
    let heartbeat: number | undefined
    let retry: number | undefined
    let closed = false

    const open = () => {
      socket = new WebSocket(groupSocketUrl(groupId))

      socket.onopen = () => {
        setConnected(true)
        heartbeat = window.setInterval(() => socket?.send('ping'), HEARTBEAT_MS)
      }
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data) as GroupEvent)
        } catch {
          /* ignore malformed frames */
        }
      }
      socket.onclose = () => {
        setConnected(false)
        window.clearInterval(heartbeat)
        if (!closed) retry = window.setTimeout(open, RECONNECT_MS)
      }
      socket.onerror = () => socket?.close()
    }

    open()
    return () => {
      closed = true
      window.clearInterval(heartbeat)
      window.clearTimeout(retry)
      socket?.close()
    }
  }, [groupId])

  return connected
}
