import type { ListenerConfig } from './types'

/** Sensible defaults for the simulator's TCP listener. */
export const DEFAULT_CONFIG: ListenerConfig = {
  bindAddress: '127.0.0.1',
  sendPort: 3700,
  receivePort: 3701,
  processingDelayMs: 50,
  autoAcceptReconnections: true,
}
