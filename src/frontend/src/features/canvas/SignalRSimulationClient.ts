import * as signalR from '@microsoft/signalr'
import type {
  MpReportedEvent,
  SimulationClient,
  SimulationEvent,
  SimulationFaultEvent,
  TransportOrderEvent,
} from './simulationClient'

/** `mpReported` hub payload (camelCase mirror of the backend `MpReportedDto`). */
interface MpReportedDto {
  telegramId: number
  transportUnitId: string
  messagePointId: string
}

/** `transportOrder` hub payload (mirror of the backend `TransportOrderDto`). */
interface TransportOrderDto extends MpReportedDto {
  destination: string
}

/** `fault` hub payload (mirror of the backend `SimulationFaultDto`); `reason` is `ack|to`. */
interface SimulationFaultDto extends MpReportedDto {
  reason: string
}

/**
 * Live {@link SimulationClient} backed by the .NET backend (ADR-0012): REST for
 * the control plane (`POST /api/simulation/arrivals`) and the SignalR
 * `SimulationHub` for the authoritative `mpReported` / `transportOrder` / `fault`
 * stream. Selected automatically when `VITE_API_BASE_URL` is configured; otherwise
 * the in-browser {@link MockSimulationClient} is used.
 *
 * Mirrors {@link SignalRConnectionClient}: the hub opens lazily on the first
 * subscribe, and transport failures never throw at the render layer — a failed
 * `reportArrival` is a best-effort no-op (the pending bin later releases via the
 * hub's `fault` timeout).
 */
export class SignalRSimulationClient implements SimulationClient {
  private readonly baseUrl: string
  private readonly hub: signalR.HubConnection
  private readonly listeners = new Set<(event: SimulationEvent) => void>()
  private started = false
  private startPromise: Promise<void> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(`${this.baseUrl}/hubs/simulation`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    this.hub.on('mpReported', (dto: MpReportedDto) =>
      this.emit({ type: 'mpReported', report: this.toReported(dto) }),
    )
    this.hub.on('transportOrder', (dto: TransportOrderDto) =>
      this.emit({ type: 'transportOrder', order: this.toOrder(dto) }),
    )
    this.hub.on('fault', (dto: SimulationFaultDto) =>
      this.emit({ type: 'fault', fault: this.toFault(dto) }),
    )
  }

  subscribe(listener: (event: SimulationEvent) => void): () => void {
    this.listeners.add(listener)
    void this.ensureHub()
    return () => {
      this.listeners.delete(listener)
    }
  }

  async reportArrival(transportUnitId: string, messagePointId: string): Promise<void> {
    await this.ensureHub()
    try {
      const response = await fetch(`${this.baseUrl}/api/simulation/arrivals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transportUnitId, messagePointId }),
      })
      if (!response.ok) {
        // Surface as a fault so the blocked bin doesn't hang forever on a reject.
        this.emit({
          type: 'fault',
          fault: { telegramId: 0, transportUnitId, messagePointId, reason: 'ack' },
        })
      }
    } catch {
      this.emit({
        type: 'fault',
        fault: { telegramId: 0, transportUnitId, messagePointId, reason: 'ack' },
      })
    }
  }

  /** Opens the hub once; failures are swallowed (the caller is never crashed). */
  private async ensureHub(): Promise<void> {
    if (this.started) return
    if (!this.startPromise) {
      this.startPromise = this.hub
        .start()
        .then(() => {
          this.started = true
        })
        .catch((error: unknown) => {
          this.startPromise = null
          throw error
        })
    }
    try {
      await this.startPromise
    } catch {
      // Already reset above; the arrival POST still attempts and may report a fault.
    }
  }

  private toReported(dto: MpReportedDto): MpReportedEvent {
    return {
      telegramId: dto.telegramId,
      transportUnitId: dto.transportUnitId,
      messagePointId: dto.messagePointId,
    }
  }

  private toOrder(dto: TransportOrderDto): TransportOrderEvent {
    return { ...this.toReported(dto), destination: dto.destination }
  }

  private toFault(dto: SimulationFaultDto): SimulationFaultEvent {
    return { ...this.toReported(dto), reason: dto.reason === 'to' ? 'to' : 'ack' }
  }

  private emit(event: SimulationEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
