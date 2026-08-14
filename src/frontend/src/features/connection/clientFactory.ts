import type { ConnectionClient } from './connectionClient'
import { MockConnectionClient } from './connectionClient'
import { SignalRConnectionClient } from './SignalRConnectionClient'

/**
 * Picks the connection client for runtime. When `VITE_API_BASE_URL` points at
 * the .NET backend, the live {@link SignalRConnectionClient} is used; otherwise
 * the in-browser {@link MockConnectionClient} keeps the screen fully
 * interactive for UI-only development. Tests inject their own client and never
 * hit this factory.
 */
export function createConnectionClient(): ConnectionClient {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  return baseUrl ? new SignalRConnectionClient(baseUrl) : new MockConnectionClient()
}
