/**
 * Boundary the canvas talks to for the backend-authoritative MP/TO round-trip
 * (ADR-0012). A bin reaching a message point is reported over REST
 * (`reportArrival`); the authoritative reply — the transport order carrying the
 * bin's next destination — arrives asynchronously as a pushed event, matched back
 * to the bin by its transport-unit id.
 *
 * The live {@link SignalRSimulationClient} drives this over the .NET backend; the
 * in-browser {@link MockSimulationClient} replays the round-trip locally so the
 * canvas is fully interactive before/without a backend (selected by
 * {@link createSimulationClient}).
 */

/** A bin reached a message point and its MP telegram (Status N) was sent. */
export interface MpReportedEvent {
  telegramId: number
  transportUnitId: string
  messagePointId: string
}

/** A resolved next destination for a bin, matched to its MP request. */
export interface TransportOrderEvent {
  telegramId: number
  transportUnitId: string
  messagePointId: string
  destination: string
}

/** A pending MP request timed out awaiting its ACK (`ack`) or TO (`to`). */
export interface SimulationFaultEvent {
  telegramId: number
  transportUnitId: string
  messagePointId: string
  reason: 'ack' | 'to'
}

/** Events pushed from the simulation transport (SignalR hub, or the mock). */
export type SimulationEvent =
  | { type: 'mpReported'; report: MpReportedEvent }
  | { type: 'transportOrder'; order: TransportOrderEvent }
  | { type: 'fault'; fault: SimulationFaultEvent }

/**
 * The MP/TO control surface the canvas depends on. Implementations never throw
 * from {@link reportArrival}; transport failures surface as a `fault` event (or,
 * for the live client, a best-effort no-op) so the render loop is never crashed
 * by a socket error.
 */
export interface SimulationClient {
  /** Report that a bin (`transportUnitId`) reached a message point (`messagePointId`). */
  reportArrival(transportUnitId: string, messagePointId: string): Promise<void>
  /** Subscribe to MP/TO/fault events. Returns an unsubscribe function. */
  subscribe(listener: (event: SimulationEvent) => void): () => void
}

/** Synthetic destinations the mock cycles through when resolving a transport order. */
const MOCK_DESTINATIONS: readonly string[] = ['DEST-A', 'DEST-B', 'DEST-C', 'DEST-D']

/**
 * In-browser stand-in for the backend MP/TO loop. On each reported arrival it
 * echoes an `mpReported` event, then — after a short processing delay — resolves a
 * `transportOrder` for the same bin, so a blocked bin releases exactly as it would
 * against the live backend. Correlation ids and destinations are synthetic.
 */
export class MockSimulationClient implements SimulationClient {
  private readonly listeners = new Set<(event: SimulationEvent) => void>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private telegramId = 0
  private resolveIndex = 0
  private readonly resolveDelayMs: number

  /** @param resolveDelayMs Delay before the mock resolves a transport order. */
  constructor(resolveDelayMs = 600) {
    this.resolveDelayMs = resolveDelayMs
  }

  subscribe(listener: (event: SimulationEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.clearTimers()
    }
  }

  reportArrival(transportUnitId: string, messagePointId: string): Promise<void> {
    this.telegramId += 1
    const telegramId = this.telegramId
    this.emit({ type: 'mpReported', report: { telegramId, transportUnitId, messagePointId } })

    const destination = MOCK_DESTINATIONS[this.resolveIndex % MOCK_DESTINATIONS.length]
    this.resolveIndex += 1
    this.defer(() => {
      this.emit({
        type: 'transportOrder',
        order: { telegramId, transportUnitId, messagePointId, destination },
      })
    }, this.resolveDelayMs)

    return Promise.resolve()
  }

  private emit(event: SimulationEvent): void {
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
  }
}
