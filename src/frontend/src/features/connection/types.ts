/** Domain types for the Connection & Session screen (server-side PLC simulator). */

/** Lifecycle of the simulator's TCP listener. */
export type ListenerStatus =
  | 'stopped'
  | 'starting'
  | 'listening'
  | 'connected'
  | 'error'

/** User-editable configuration for the simulator's TCP listener. */
export interface ListenerConfig {
  /** Local interface to bind. `0.0.0.0` = all interfaces. */
  bindAddress: string
  /** TCP port the simulator sends outbound telegrams on. */
  sendPort: number
  /** TCP port the simulator receives inbound telegrams on. */
  receivePort: number
  /**
   * Simulated time (ms) the PLC waits before it processes and replies to an
   * inbound telegram. Models real controller latency; replaces the mockup's
   * client-side "heartbeat" field, which does not apply to a server.
   */
  processingDelayMs: number
  /** Keep the listener open and accept a new client after one disconnects. */
  autoAcceptReconnections: boolean
}

/** A single row in the live-traffic log. */
export type TrafficLevel = 'out' | 'in' | 'error' | 'system'

export interface TrafficEntry {
  id: string
  /** Epoch milliseconds. */
  timestamp: number
  level: TrafficLevel
  /** Raw telegram bytes for `out` / `in` rows. */
  payload?: readonly number[]
  /** Free-text content for `error` / `system` rows. */
  message?: string
  /** Optional decoded label (e.g. `ACK`, `MP_INIT`) shown alongside the row. */
  label?: string
}
