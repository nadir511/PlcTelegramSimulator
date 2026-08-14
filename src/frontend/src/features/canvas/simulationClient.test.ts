import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockSimulationClient } from './simulationClient'
import type { SimulationEvent } from './simulationClient'
import { createSimulationClient } from './simulationClientFactory'
import { SignalRSimulationClient } from './SignalRSimulationClient'

describe('MockSimulationClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('echoes mpReported immediately then resolves a transportOrder after the delay', () => {
    vi.useFakeTimers()
    const client = new MockSimulationClient(500)
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    void client.reportArrival('TU-1', 'MP1')

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      type: 'mpReported',
      report: { telegramId: 1, transportUnitId: 'TU-1', messagePointId: 'MP1' },
    })

    vi.advanceTimersByTime(500)

    expect(events).toHaveLength(2)
    const resolved = events[1]
    expect(resolved.type).toBe('transportOrder')
    if (resolved.type === 'transportOrder') {
      expect(resolved.order.transportUnitId).toBe('TU-1')
      expect(resolved.order.messagePointId).toBe('MP1')
      expect(resolved.order.destination).toBeTruthy()
    }
  })

  it('does not deliver a transport order after the last listener unsubscribes', () => {
    vi.useFakeTimers()
    const client = new MockSimulationClient(500)
    const events: SimulationEvent[] = []
    const unsubscribe = client.subscribe((event) => events.push(event))

    void client.reportArrival('TU-9', 'MP9') // mpReported delivered synchronously
    unsubscribe() // last listener gone -> pending TO timer is cleared
    vi.advanceTimersByTime(500)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('mpReported')
  })
})

describe('createSimulationClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the in-browser mock when no API base URL is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(createSimulationClient()).toBeInstanceOf(MockSimulationClient)
  })

  it('returns the live SignalR client when an API base URL is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5088')
    expect(createSimulationClient()).toBeInstanceOf(SignalRSimulationClient)
  })
})
