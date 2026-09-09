import type { ListenerConfig, ListenerStatus, TrafficEntry } from './types'

/** Immutable view of the listener at a point in time. */
export interface ConnectionSnapshot {
  status: ListenerStatus
  error: string | null
}

/** Events pushed from the transport (real-time channel, or the mock). */
export type ConnectionEvent =
  | { type: 'status'; status: ListenerStatus; error?: string | null }
  | { type: 'traffic'; entry: TrafficEntry }

/**
 * Boundary the UI talks to. A real implementation will drive this over the
 * backend REST API + real-time channel; {@link MockConnectionClient} provides
 * an in-browser simulation until that backend exists.
 */
export interface ConnectionClient {
  getSnapshot(): ConnectionSnapshot
  /**
   * Start the listener. `endOfTelegram` is the registry-wide End-of-Telegram
   * terminator (e.g. `#`); the backend appends it to every outbound telegram and
   * splits inbound frames on it, so callers never append it to payloads themselves.
   */
  start(config: ListenerConfig, endOfTelegram: string): Promise<void>
  stop(): Promise<void>
  /** Send a manual telegram to the connected client. */
  send(payload: readonly number[]): Promise<void>
  /** Subscribe to status + traffic events. Returns an unsubscribe function. */
  subscribe(listener: (event: ConnectionEvent) => void): () => void
}

let sequence = 0
const nextId = (): string => {
  sequence += 1
  return `evt-${Date.now().toString(36)}-${sequence}`
}

/** Sample outbound telegrams the mock cycles through (STX ... ETX). */
const SAMPLE_TELEGRAMS: ReadonlyArray<{ payload: number[]; label: string }> = [
  { payload: [0x02, 0x4d, 0x50, 0x30, 0x31, 0x00, 0x00, 0x00, 0x03], label: 'MP_INIT' },
  { payload: [0x02, 0x50, 0x44, 0x31, 0x32, 0x37, 0x00, 0x03], label: 'PD_STATUS' },
  { payload: [0x02, 0x53, 0x45, 0x30, 0x34, 0x00, 0x03], label: 'SENSOR_EVT' },
]

/**
 * In-browser stand-in for the backend. Simulates the listener lifecycle
 * (starting → listening → connected) and emits sample telegram traffic so the
 * screen is fully interactive before the real server is wired up.
 */
export class MockConnectionClient implements ConnectionClient {
  private status: ListenerStatus = 'stopped'
  private error: string | null = null
  private config: ListenerConfig | null = null
  private telegramIndex = 0
  private readonly listeners = new Set<(event: ConnectionEvent) => void>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private interval: ReturnType<typeof setInterval> | null = null

  getSnapshot(): ConnectionSnapshot {
    return { status: this.status, error: this.error }
  }

  subscribe(listener: (event: ConnectionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.clearTimers()
    }
  }

  start(config: ListenerConfig): Promise<void> {
    this.clearTimers()
    this.config = config
    this.error = null
    this.setStatus('starting')

    this.defer(() => {
      this.setStatus('listening')
      this.emitSystem(
        `Listener bound to ${config.bindAddress} (rx ${config.receivePort} / tx ${config.sendPort})`,
      )
    }, 150)

    this.defer(() => {
      this.setStatus('connected')
      this.emitSystem('Client connected from 192.168.1.42')
      this.startTraffic()
    }, 800)

    return Promise.resolve()
  }

  stop(): Promise<void> {
    this.clearTimers()
    if (this.status !== 'stopped') {
      this.setStatus('stopped')
      this.emitSystem('Listener stopped')
    }
    return Promise.resolve()
  }

  send(payload: readonly number[]): Promise<void> {
    if (this.status !== 'connected') {
      this.emitSystem('Cannot send: no client connected')
      return Promise.resolve()
    }

    this.emit({ type: 'traffic', entry: this.telegram('out', [...payload], 'MANUAL') })

    const delay = this.config?.processingDelayMs ?? 50
    this.defer(() => {
      this.emit({ type: 'traffic', entry: this.telegram('in', [0x06], 'ACK') })
    }, delay)

    return Promise.resolve()
  }

  private startTraffic(): void {
    let tick = 0
    this.interval = setInterval(() => {
      tick += 1
      const template = SAMPLE_TELEGRAMS[this.telegramIndex % SAMPLE_TELEGRAMS.length]
      this.telegramIndex += 1
      this.emit({ type: 'traffic', entry: this.telegram('out', template.payload, template.label) })

      const delay = this.config?.processingDelayMs ?? 50
      // The simulated PLC replies with an ACK after its processing delay.
      this.defer(() => {
        this.emit({ type: 'traffic', entry: this.telegram('in', [0x06], 'ACK') })
      }, delay)

      // Occasionally surface a transient error to exercise the error path.
      if (tick % 7 === 0) {
        this.emit({
          type: 'traffic',
          entry: {
            id: nextId(),
            timestamp: Date.now(),
            level: 'error',
            message: `Malformed frame discarded (bad checksum) on port ${this.config?.receivePort ?? 0}`,
          },
        })
        if (this.config?.autoAcceptReconnections) {
          this.defer(() => this.emitSystem('Awaiting client reconnect...'), 120)
        }
      }
    }, 1200)
  }

  private telegram(level: 'out' | 'in', payload: number[], label: string): TrafficEntry {
    return { id: nextId(), timestamp: Date.now(), level, payload, label }
  }

  private emitSystem(message: string): void {
    this.emit({
      type: 'traffic',
      entry: { id: nextId(), timestamp: Date.now(), level: 'system', message },
    })
  }

  private setStatus(status: ListenerStatus, error: string | null = null): void {
    this.status = status
    this.error = error
    this.emit({ type: 'status', status, error })
  }

  private emit(event: ConnectionEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private defer(action: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      action()
    }, delayMs)
    this.timers.add(timer)
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}
