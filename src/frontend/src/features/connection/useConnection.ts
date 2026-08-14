import { useCallback, useEffect, useState } from 'react'
import type { ConnectionClient } from './connectionClient'
import type { ListenerConfig, ListenerStatus, TrafficEntry } from './types'

/** Cap the in-memory log so a long-running session can't grow unbounded. */
export const MAX_LOG_ENTRIES = 500

export interface UseConnectionResult {
  status: ListenerStatus
  error: string | null
  entries: TrafficEntry[]
  start: (config: ListenerConfig) => void
  stop: () => void
  send: (payload: readonly number[]) => void
  clear: () => void
}

/**
 * Subscribes to a {@link ConnectionClient} and exposes listener status plus the
 * live-traffic log to the UI. Presentation stays separate from this data layer.
 */
export function useConnection(client: ConnectionClient): UseConnectionResult {
  const [status, setStatus] = useState<ListenerStatus>(() => client.getSnapshot().status)
  const [error, setError] = useState<string | null>(() => client.getSnapshot().error)
  const [entries, setEntries] = useState<TrafficEntry[]>([])

  useEffect(() => {
    // Re-sync with the client we just (re)subscribed to.
    const snapshot = client.getSnapshot()
    setStatus(snapshot.status)
    setError(snapshot.error)

    return client.subscribe((event) => {
      if (event.type === 'status') {
        setStatus(event.status)
        setError(event.error ?? null)
        return
      }
      setEntries((previous) => {
        const next = [...previous, event.entry]
        return next.length > MAX_LOG_ENTRIES
          ? next.slice(next.length - MAX_LOG_ENTRIES)
          : next
      })
    })
  }, [client])

  const start = useCallback(
    (config: ListenerConfig) => {
      void client.start(config)
    },
    [client],
  )

  const stop = useCallback(() => {
    void client.stop()
  }, [client])

  const send = useCallback(
    (payload: readonly number[]) => {
      void client.send(payload)
    },
    [client],
  )

  const clear = useCallback(() => setEntries([]), [])

  return { status, error, entries, start, stop, send, clear }
}
