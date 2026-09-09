import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArrivalTelegram, SimulationEvent } from './simulationClient'

// Hoisted so the module mock factory (evaluated during import) can close over them.
const { handlers, startMock } = vi.hoisted(() => ({
  handlers: new Map<string, (dto: unknown) => void>(),
  startMock: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

// Minimal @microsoft/signalr stand-in: a builder that yields a hub whose `.on`
// handlers the test can invoke to simulate authoritative server pushes.
vi.mock('@microsoft/signalr', () => {
  class HubConnectionBuilder {
    withUrl() {
      return this
    }
    withAutomaticReconnect() {
      return this
    }
    configureLogging() {
      return this
    }
    build() {
      return {
        on: (name: string, cb: (dto: unknown) => void) => handlers.set(name, cb),
        start: startMock,
      }
    }
  }
  return { HubConnectionBuilder, LogLevel: { Warning: 3 } }
})

import { SignalRSimulationClient } from './SignalRSimulationClient'

describe('SignalRSimulationClient', () => {
  beforeEach(() => {
    handlers.clear()
    startMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not release a bin (emits no fault) when the arrival POST fails', async () => {
    // Backend unreachable: the fetch rejects. The bin must keep waiting, so the
    // client must NOT fabricate a fault that would release it.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const client = new SignalRSimulationClient('http://localhost:5088')
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    await client.reportArrival('TU-1', 'MP1')

    expect(events).toHaveLength(0)
  })

  it('does not release a bin when the arrival POST returns a non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const client = new SignalRSimulationClient('http://localhost:5088')
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    await client.reportArrival('TU-1', 'MP1')

    expect(events).toHaveLength(0)
  })

  it('maps destinationMp from an authoritative transportOrder hub push', () => {
    const client = new SignalRSimulationClient('http://localhost:5088')
    const events: SimulationEvent[] = []
    client.subscribe((event) => events.push(event))

    handlers.get('transportOrder')?.({
      telegramId: 5,
      transportUnitId: 'TU-1',
      messagePointId: 'MP1',
      destination: 'MP2',
      destinationMp: 'MP2',
    })

    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event.type).toBe('transportOrder')
    if (event.type === 'transportOrder') {
      expect(event.order.transportUnitId).toBe('TU-1')
      expect(event.order.destinationMp).toBe('MP2')
    }
  })

  it('sends the correlation id and encoded telegram bytes in the arrival POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const client = new SignalRSimulationClient('http://localhost:5088')

    const telegram: ArrivalTelegram = {
      telegramId: 7,
      payload: [0x43, 0x56, 0x23],
    }
    await client.reportArrival('TU-1', 'MP1', telegram)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(requestInit.body)) as Record<string, unknown>
    // ADR-0009: the id rides as a scalar; the finished bytes ride verbatim as `telegram`.
    expect(body).toEqual({
      transportUnitId: 'TU-1',
      messagePointId: 'MP1',
      telegramId: 7,
      telegram: [0x43, 0x56, 0x23],
    })
  })

  it('sends the id without a telegram array when the payload could not be encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const client = new SignalRSimulationClient('http://localhost:5088')

    await client.reportArrival('TU-1', 'MP1', { telegramId: 9 })

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(requestInit.body)) as Record<string, unknown>
    expect(body).toEqual({ transportUnitId: 'TU-1', messagePointId: 'MP1', telegramId: 9 })
    expect('telegram' in body).toBe(false)
  })

  it('omits the telegram from the POST body when none is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const client = new SignalRSimulationClient('http://localhost:5088')

    await client.reportArrival('TU-1', 'MP1')

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(requestInit.body)) as Record<string, unknown>
    expect(body).toEqual({ transportUnitId: 'TU-1', messagePointId: 'MP1' })
    expect('telegram' in body).toBe(false)
  })
})
