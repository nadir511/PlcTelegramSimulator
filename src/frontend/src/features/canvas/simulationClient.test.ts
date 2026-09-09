import { afterEach, describe, expect, it, vi } from 'vitest'
import { DisconnectedSimulationClient, MockSimulationClient } from './simulationClient'
import type { SimulationClient, SimulationEvent } from './simulationClient'
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

  it('carries the routed next-MP id (destinationMp) when a resolver is supplied', () => {
    vi.useFakeTimers()
    const client = new MockSimulationClient(500, (mp) => (mp === 'MP1' ? 'MP2' : undefined))
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    void client.reportArrival('TU-1', 'MP1')
    vi.advanceTimersByTime(500)

    const resolved = events[1]
    expect(resolved.type).toBe('transportOrder')
    if (resolved.type === 'transportOrder') {
      expect(resolved.order.destinationMp).toBe('MP2')
    }
  })

  it('uses the supplied correlation id and emits mpReported without touching the wire', () => {
    vi.useFakeTimers()
    // Reached through the interface so the optional telegram arg type-checks. The mock
    // echoes the frontend-minted id (ADR-0009) but ignores the encoded payload bytes —
    // only the live client puts bytes on the wire.
    const client: SimulationClient = new MockSimulationClient(500)
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    void client.reportArrival('TU-1', 'MP1', { telegramId: 1, payload: [0x43, 0x56, 0x23] })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      type: 'mpReported',
      report: { telegramId: 1, transportUnitId: 'TU-1', messagePointId: 'MP1' },
    })
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

  it('reset() restarts the telegram-id sequence and drops pending transport orders', () => {
    vi.useFakeTimers()
    const client = new MockSimulationClient(500)
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    void client.reportArrival('TU-1', 'MP1') // mpReported #1, TO pending
    client.reset() // sequence back to 0, pending TO timer cleared
    vi.advanceTimersByTime(500)
    expect(events.filter((event) => event.type === 'transportOrder')).toHaveLength(0)

    void client.reportArrival('TU-2', 'MP1') // a fresh run restarts at #1
    const reported = events.filter((event) => event.type === 'mpReported')
    const last = reported[reported.length - 1]
    expect(last.type).toBe('mpReported')
    if (last.type === 'mpReported') {
      expect(last.report.telegramId).toBe(1)
    }
  })
})

describe('DisconnectedSimulationClient', () => {
  it('emits nothing on a reported arrival, so a blocked bin keeps waiting', async () => {
    const client: SimulationClient = new DisconnectedSimulationClient()
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    await client.reportArrival('TU-1', 'MP1')

    expect(events).toHaveLength(0)
  })
})

describe('createSimulationClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the passive disconnected client when no API base URL is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(createSimulationClient()).toBeInstanceOf(DisconnectedSimulationClient)
  })

  it('returns the live SignalR client when an API base URL is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5088')
    expect(createSimulationClient()).toBeInstanceOf(SignalRSimulationClient)
  })

  it('returns the disconnected client when demo is off and no backend is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(createSimulationClient({ demo: false })).toBeInstanceOf(DisconnectedSimulationClient)
  })

  it('returns the demo mock client when demo is on and no backend is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(createSimulationClient({ demo: true })).toBeInstanceOf(MockSimulationClient)
  })

  it('ignores the demo flag and returns the live client when a backend is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5088')
    expect(createSimulationClient({ demo: true })).toBeInstanceOf(SignalRSimulationClient)
  })
})
