import type { SimulationClient } from './simulationClient'
import { DisconnectedSimulationClient, MockSimulationClient } from './simulationClient'
import { SignalRSimulationClient } from './SignalRSimulationClient'

/** Options steering the no-backend choice (a configured backend always wins). */
export interface CreateSimulationClientOptions {
  /**
   * With no backend configured, opt into the local demo resolver
   * ({@link MockSimulationClient}) so a frontend-only run can watch the full
   * MP→TO→next-MP cycle. When false (the default), the passive
   * {@link DisconnectedSimulationClient} is used and bins hold at their message
   * points awaiting a real transport order. Ignored when a backend is configured.
   */
  demo?: boolean
  /** Route-derived resolver supplying the demo client's next-MP id (`destinationMp`). */
  nextMessagePoint?: (messagePointId: string) => string | undefined
}

/**
 * Picks the simulation client for runtime. When `VITE_API_BASE_URL` points at the
 * .NET backend, the live {@link SignalRSimulationClient} drives the MP/TO
 * round-trip (ADR-0012) and the demo flag is ignored. Otherwise, with no backend,
 * the choice is the opt-in demo {@link MockSimulationClient} (`demo: true`, which
 * fabricates transport orders locally) or the passive
 * {@link DisconnectedSimulationClient} (the default — a bin holds at its message
 * point instead of moving on). Tests inject their own client and never hit this
 * factory.
 */
export function createSimulationClient(
  options: CreateSimulationClientOptions = {},
): SimulationClient {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (baseUrl) return new SignalRSimulationClient(baseUrl)
  return options.demo
    ? new MockSimulationClient(undefined, options.nextMessagePoint)
    : new DisconnectedSimulationClient()
}
