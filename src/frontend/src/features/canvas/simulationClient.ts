/**
 * Boundary the canvas talks to for the backend-authoritative MP/TO round-trip
 * (ADR-0012). A bin reaching a message point is reported over REST
 * (`reportArrival`); the authoritative reply — the transport order carrying the
 * bin's next destination — arrives asynchronously as a pushed event, matched back
 * to the bin by its transport-unit id.
 *
 * The live {@link SignalRSimulationClient} drives this over the .NET backend. When
 * no backend is configured the passive {@link DisconnectedSimulationClient} is used
 * instead: a bin reaching an MP is reported into the void and simply holds there,
 * because the routing decision is backend-authoritative (ADR-0012) — nothing moves
 * on without a real transport order. The {@link MockSimulationClient} can still
 * replay the round-trip locally for tests or opt-in demos. Selection happens in
 * {@link createSimulationClient}.
 */

/** The frontend-encoded telegram sent with a bin arrival (ADR-0009). */
export interface ArrivalTelegram {
  /** Frontend-minted correlation id, already encoded into {@link payload}. */
  telegramId: number
  /**
   * The finished telegram bytes (`0..255`) to relay verbatim, or absent when the
   * telegram couldn't be finalised frontend-side (the backend then uses its interim
   * codec, still correlating on {@link telegramId}).
   */
  payload?: number[]
}

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
  /** Id of the next message point the bin is routed to (from the backend). */
  destinationMp?: string
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
 * from {@link reportArrival}; a transport failure is a best-effort no-op — the
 * bin stays blocked until the backend pushes the authoritative transport order,
 * so the render loop is never crashed and nothing is released without a real reply.
 */
export interface SimulationClient {
  /**
   * Report that a bin (`transportUnitId`) reached a message point (`messagePointId`).
   * The optional `telegram` carries the frontend-minted correlation id and the
   * complete encoded telegram for the sensor's bound type (ADR-0009): when a
   * `payload` is present the backend relays those bytes verbatim (the id is already
   * encoded in); when absent it falls back to its interim MP codec, still correlating
   * on `telegramId`. Clients that never touch the wire (mock/disconnected) may ignore
   * the payload.
   */
  reportArrival(
    transportUnitId: string,
    messagePointId: string,
    telegram?: ArrivalTelegram,
  ): Promise<void>
  /** Subscribe to MP/TO/fault events. Returns an unsubscribe function. */
  subscribe(listener: (event: SimulationEvent) => void): () => void
  /**
   * Reset any per-run correlation state so a fresh simulation run restarts cleanly
   * (e.g. the demo telegram-id sequence back to `000001`). Optional: the live and
   * disconnected clients carry no such state, so they omit it. Subscriptions are
   * preserved — only the run-scoped counters are cleared.
   */
  reset?(): void
}

/** Synthetic destinations the mock cycles through when resolving a transport order. */
const MOCK_DESTINATIONS: readonly string[] = ['DEST-A', 'DEST-B', 'DEST-C', 'DEST-D']

/**
 * In-browser stand-in for the backend MP/TO loop, kept for tests and opt-in demos
 * (it is **not** the default no-backend client — see
 * {@link DisconnectedSimulationClient}). On each reported arrival it echoes an
 * `mpReported` event, then — after a short processing delay — resolves a
 * `transportOrder` for the same bin, so a blocked bin releases exactly as it would
 * against the live backend. Correlation ids and the fallback destination are
 * synthetic; an optional `nextMessagePoint` resolver supplies the routed next-MP id
 * (`destinationMp`) so the enriched TO contract can be exercised.
 */
export class MockSimulationClient implements SimulationClient {
  private readonly listeners = new Set<(event: SimulationEvent) => void>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private telegramId = 0
  private resolveIndex = 0
  private readonly resolveDelayMs: number
  private readonly nextMessagePoint?: (messagePointId: string) => string | undefined

  /**
   * @param resolveDelayMs Delay before the mock resolves a transport order.
   * @param nextMessagePoint Optional resolver for the routed next-MP id; when it
   *   returns a value the resolved TO carries it as `destinationMp`.
   */
  constructor(
    resolveDelayMs = 600,
    nextMessagePoint?: (messagePointId: string) => string | undefined,
  ) {
    this.resolveDelayMs = resolveDelayMs
    this.nextMessagePoint = nextMessagePoint
  }

  subscribe(listener: (event: SimulationEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.clearTimers()
    }
  }

  /**
   * Restart the demo run: zero the telegram-id and destination sequences (so the next
   * reported arrival is `#000001` again) and drop any pending transport-order timers.
   * Listeners are kept, so an in-place restart needs no re-subscribe.
   */
  reset(): void {
    this.clearTimers()
    this.telegramId = 0
    this.resolveIndex = 0
  }

  /**
   * Report an arrival and drive the demo round-trip. When the caller supplies a
   * frontend-minted `telegram.telegramId` (ADR-0009) the mock echoes that id so the
   * displayed id matches the live-backend path; otherwise it mints its own sequence.
   * The encoded `payload` is ignored — the mock never touches the wire.
   */
  reportArrival(
    transportUnitId: string,
    messagePointId: string,
    telegram?: ArrivalTelegram,
  ): Promise<void> {
    const telegramId = telegram?.telegramId ?? this.telegramId + 1
    this.telegramId = Math.max(this.telegramId, telegramId)
    this.emit({ type: 'mpReported', report: { telegramId, transportUnitId, messagePointId } })

    const destination = MOCK_DESTINATIONS[this.resolveIndex % MOCK_DESTINATIONS.length]
    this.resolveIndex += 1
    const destinationMp = this.nextMessagePoint?.(messagePointId)
    this.defer(() => {
      this.emit({
        type: 'transportOrder',
        order: { telegramId, transportUnitId, messagePointId, destination, destinationMp },
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

/**
 * The passive no-backend client. It accepts subscriptions and reported arrivals but
 * never emits a `transportOrder` or `fault`, so a bin that reaches a message point
 * blocks there indefinitely — exactly the backend-authoritative behaviour of
 * ADR-0012 when no backend is connected: nothing is routed on without a real reply.
 */
export class DisconnectedSimulationClient implements SimulationClient {
  private readonly listeners = new Set<(event: SimulationEvent) => void>()

  subscribe(listener: (event: SimulationEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  reportArrival(): Promise<void> {
    // No backend: the arrival is intentionally dropped and the bin keeps waiting.
    return Promise.resolve()
  }
}
