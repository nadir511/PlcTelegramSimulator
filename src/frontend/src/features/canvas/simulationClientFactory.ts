import type { SimulationClient } from './simulationClient'
import { MockSimulationClient } from './simulationClient'
import { SignalRSimulationClient } from './SignalRSimulationClient'

/**
 * Picks the simulation client for runtime. When `VITE_API_BASE_URL` points at the
 * .NET backend, the live {@link SignalRSimulationClient} drives the MP/TO
 * round-trip (ADR-0012); otherwise the in-browser {@link MockSimulationClient}
 * replays it locally so the canvas stays fully interactive for UI-only work.
 * Tests inject their own client and never hit this factory.
 */
export function createSimulationClient(): SimulationClient {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  return baseUrl ? new SignalRSimulationClient(baseUrl) : new MockSimulationClient()
}
