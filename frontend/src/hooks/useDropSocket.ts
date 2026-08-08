import { useEffect, useRef, useState } from 'react'

import { dropSocketUrl } from '../api/client'
import type { DropEvent } from '../types'

const HEARTBEAT_MS = 25_000
const RECONNECT_MS = 3_000

/** Subscribes to the global drop feed. Reconnects on drop. */
export function useDropSocket(onEvent: (event: DropEvent) => void) {
  const [connected, setConnected] = useState(false)
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    let socket: WebSocket | null = null
    let heartbeat: number | undefined
    let retry: number | undefined
    let closed = false

    const open = () => {
      socket = new WebSocket(dropSocketUrl())

      socket.onopen = () => {
        setConnected(true)
        heartbeat = window.setInterval(() => socket?.send('ping'), HEARTBEAT_MS)
      }
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data) as DropEvent)
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
  }, [])

  return connected
}
