import * as signalR from '@microsoft/signalr'
import type {
  ConnectionClient,
  ConnectionEvent,
  ConnectionSnapshot,
} from './connectionClient'
import type { ListenerConfig, ListenerStatus, TrafficEntry, TrafficLevel } from './types'

/** Status snapshot pushed by the hub / returned by `GET /api/connection`. */
interface StatusDto {
  status: ListenerStatus
  error: string | null
}

/** Traffic row pushed by the hub (`payload` is a JSON array of byte values). */
interface TrafficDto {
  id: string
  timestamp: number
  level: TrafficLevel
  payload?: number[]
  message?: string
  label?: string
}

/**
 * Live {@link ConnectionClient} backed by the .NET backend (see
 * [ADR-0006](../../../../docs/adr/0006-real-time-transport.md) /
 * [ADR-0007](../../../../docs/adr/0007-connection-api-and-transport-model.md)):
 * REST for the control plane (start/stop/send) and a SignalR hub for the live
 * status + traffic stream. Selected automatically when `VITE_API_BASE_URL` is
 * configured; otherwise the in-browser {@link MockConnectionClient} is used.
 */
export class SignalRConnectionClient implements ConnectionClient {
  private readonly baseUrl: string
  private readonly hub: signalR.HubConnection
  private snapshot: ConnectionSnapshot = { status: 'stopped', error: null }
  private readonly listeners = new Set<(event: ConnectionEvent) => void>()
  private started = false
  private startPromise: Promise<void> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(`${this.baseUrl}/hubs/connection`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    this.hub.on('status', (dto: StatusDto) => this.applyStatus(dto))
    this.hub.on('traffic', (dto: TrafficDto) =>
      this.emit({ type: 'traffic', entry: this.toEntry(dto) }),
    )
    this.hub.onreconnecting((error) =>
      this.emitSystem(`Reconnecting to server${error ? `: ${error.message}` : ''}...`),
    )
    this.hub.onreconnected(() => {
      this.emitSystem('Reconnected to server')
      void this.refreshSnapshot()
    })
    this.hub.onclose((error) =>
      this.setStatus('error', error ? `Disconnected: ${error.message}` : 'Disconnected from server'),
    )
  }

  getSnapshot(): ConnectionSnapshot {
    return this.snapshot
  }

  subscribe(listener: (event: ConnectionEvent) => void): () => void {
    this.listeners.add(listener)
    void this.ensureHub()
    return () => {
      this.listeners.delete(listener)
    }
  }

  async start(config: ListenerConfig, endOfTelegram: string): Promise<void> {
    await this.ensureHub()
    await this.post('/api/connection/start', { ...config, endOfTelegram })
  }

  async stop(): Promise<void> {
    await this.post('/api/connection/stop')
  }

  async send(payload: readonly number[]): Promise<void> {
    await this.post('/api/connection/send', { payload: [...payload] })
  }

  /** Opens the hub once; failures surface as an `error` status, not an exception. */
  private async ensureHub(): Promise<void> {
    if (this.started) return
    if (!this.startPromise) {
      this.startPromise = this.hub
        .start()
        .then(async () => {
          this.started = true
          await this.refreshSnapshot()
        })
        .catch((error: unknown) => {
          this.startPromise = null
          const message = error instanceof Error ? error.message : String(error)
          this.setStatus('error', `Cannot reach server at ${this.baseUrl}: ${message}`)
          throw error
        })
    }
    try {
      await this.startPromise
    } catch {
      // Already surfaced via the error status above; don't crash callers.
    }
  }

  /** Reconciles local state with the server (covers a missed connect push). */
  private async refreshSnapshot(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/connection`)
      if (!response.ok) return
      this.applyStatus((await response.json()) as StatusDto)
    } catch {
      // Best-effort; the hub push will populate status shortly.
    }
  }

  private async post(path: string, body?: unknown): Promise<void> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emitSystem(`Request failed (${path}): ${message}`)
      return
    }
    if (!response.ok) {
      const detail = await this.readProblem(response)
      this.emitSystem(`Server rejected ${path} (${response.status})${detail ? `: ${detail}` : ''}`)
    }
  }

  private async readProblem(response: Response): Promise<string | null> {
    try {
      const data = (await response.json()) as { detail?: string; title?: string }
      return data.detail ?? data.title ?? null
    } catch {
      return null
    }
  }

  private toEntry(dto: TrafficDto): TrafficEntry {
    return {
      id: dto.id,
      timestamp: dto.timestamp,
      level: dto.level,
      payload: dto.payload,
      message: dto.message,
      label: dto.label,
    }
  }

  private applyStatus(dto: StatusDto): void {
    this.setStatus(dto.status, dto.error ?? null)
  }

  private setStatus(status: ListenerStatus, error: string | null): void {
    this.snapshot = { status, error }
    this.emit({ type: 'status', status, error })
  }

  private emitSystem(message: string): void {
    this.emit({
      type: 'traffic',
      entry: {
        id: `sys-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        level: 'system',
        message,
      },
    })
  }

  private emit(event: ConnectionEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
