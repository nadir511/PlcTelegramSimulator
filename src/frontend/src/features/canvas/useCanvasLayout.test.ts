import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SimulationClient, SimulationEvent } from './simulationClient'
import type { CanvasLayout, Component } from './types'
import { useCanvasLayout } from './useCanvasLayout'

/** Records reported arrivals and lets the test push authoritative TO/fault events. */
class FakeSimulationClient implements SimulationClient {
  readonly arrivals: Array<{ transportUnitId: string; messagePointId: string }> = []
  private readonly listeners = new Set<(event: SimulationEvent) => void>()

  reportArrival(transportUnitId: string, messagePointId: string): Promise<void> {
    this.arrivals.push({ transportUnitId, messagePointId })
    return Promise.resolve()
  }

  subscribe(listener: (event: SimulationEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: SimulationEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

// A belt at (100,200) 5 m × 0.6 m (→ 200 × 24 px at 40 ppm); a bin spawns at its
// left edge (108, 212). The MP sensor's 16 px point sits over that spot so a bin
// arrives the instant it is spawned.
const belt: Component = {
  id: 'belt-1',
  kind: 'straight-belt',
  label: 'Belt',
  position: { x: 100, y: 200 },
  rotation: 0,
  geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
  ports: [
    { id: 'belt-1:in', role: 'in' },
    { id: 'belt-1:out', role: 'out' },
  ],
  transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
}

const mpSensor: Component = {
  id: 'mp-1',
  kind: 'mp-sensor',
  label: 'MP Sensor',
  position: { x: 100, y: 204 },
  rotation: 0,
  geometry: { lengthMeters: 0.4, widthMeters: 0.4 },
  ports: [],
  sensor: {
    telegramTypeId: 'MP',
    mpId: 'MP1',
    fieldBindings: [
      { field: 'MP', source: 'mpId' },
      { field: 'TU', source: 'bin.tuId' },
    ],
  },
}

function seedLayout(): CanvasLayout {
  return {
    schemaVersion: 1,
    units: { pixelsPerMeter: 40, lengthUnit: 'm' },
    components: [belt, mpSensor],
    connections: [{ from: 'belt-1:out', to: 'mp-1:in' }],
    binSource: { id: 'src', types: [{ typeId: 'TOTE', color: '#3b82f6', count: 5 }] },
    areas: [],
    controlLogic: { minBinDistanceMeters: 0.3, conveyorSpeedScale: 1 },
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('useCanvasLayout MP/TO integration', () => {
  it('reports an arrival and blocks the bin until its transport order arrives', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    const tuId = result.current.bins[0].tuId

    expect(client.arrivals).toEqual([{ transportUnitId: tuId, messagePointId: 'MP1' }])
    expect(result.current.awaitingTo.has(tuId)).toBe(true)

    act(() => {
      client.emit({
        type: 'transportOrder',
        order: { telegramId: 1, transportUnitId: tuId, messagePointId: 'MP1', destination: 'DEST-A' },
      })
    })

    expect(result.current.awaitingTo.has(tuId)).toBe(false)
  })

  it('reports each MP arrival only once while the bin sits on the sensor', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    // The bin is blocked, so ticking keeps it over the sensor without re-reporting.
    act(() => {
      result.current.tick(16)
    })

    expect(client.arrivals).toHaveLength(1)
  })

  it('releases a blocked bin when its pending request faults (timeout)', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    const tuId = result.current.bins[0].tuId
    expect(result.current.awaitingTo.has(tuId)).toBe(true)

    act(() => {
      client.emit({
        type: 'fault',
        fault: { telegramId: 1, transportUnitId: tuId, messagePointId: 'MP1', reason: 'to' },
      })
    })

    expect(result.current.awaitingTo.has(tuId)).toBe(false)
  })

  it('clears awaiting state and pending reports on stop', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    expect(result.current.awaitingTo.size).toBe(1)

    act(() => {
      result.current.stop()
    })

    expect(result.current.awaitingTo.size).toBe(0)
    expect(result.current.bins).toHaveLength(0)
  })
})

describe('useCanvasLayout editing', () => {
  it('adds a dropped component centred on the drop point', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.addComponent('straight-belt', { x: 500, y: 300 })
    })

    const added = result.current.components.find((component) => component.id === result.current.selectedId)
    expect(added).toBeDefined()
    if (!added) return
    // A 5 m × 0.6 m belt is 200 × 24 px at 40 ppm, so centring offsets by half.
    expect(added.position).toEqual({ x: 500 - 100, y: 300 - 12 })
  })

  it('removes a component along with its connections', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.selectNode('belt-1')
    })
    expect(result.current.selectedId).toBe('belt-1')

    act(() => {
      result.current.removeComponent('belt-1')
    })

    expect(result.current.components.some((component) => component.id === 'belt-1')).toBe(false)
    expect(result.current.components.some((component) => component.id === 'mp-1')).toBe(true)
    expect(result.current.selectedId).toBeNull()
  })
})

describe('useCanvasLayout connections', () => {
  const secondBelt: Component = {
    id: 'belt-2',
    kind: 'straight-belt',
    label: 'Belt 2',
    position: { x: 400, y: 200 },
    rotation: 0,
    geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
    ports: [
      { id: 'belt-2:in', role: 'in' },
      { id: 'belt-2:out', role: 'out' },
    ],
    transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
  }

  function twoBeltSeed(): CanvasLayout {
    return { ...seedLayout(), components: [belt, secondBelt], connections: [] }
  }

  it('adds an out → in connection between two components', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(twoBeltSeed(), client))

    act(() => {
      result.current.addConnection('belt-1:out', 'belt-2:in')
    })

    expect(result.current.connections).toEqual([{ from: 'belt-1:out', to: 'belt-2:in' }])
  })

  it('normalises a reversed drag and rejects self / duplicate links', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(twoBeltSeed(), client))

    act(() => {
      result.current.addConnection('belt-2:in', 'belt-1:out') // reversed
    })
    expect(result.current.connections).toEqual([{ from: 'belt-1:out', to: 'belt-2:in' }])

    act(() => {
      result.current.addConnection('belt-1:out', 'belt-1:in') // self
      result.current.addConnection('belt-1:out', 'belt-2:in') // duplicate
    })
    expect(result.current.connections).toHaveLength(1)
  })

  it('removes an existing connection', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(twoBeltSeed(), client))

    act(() => {
      result.current.addConnection('belt-1:out', 'belt-2:in')
    })
    expect(result.current.connections).toHaveLength(1)

    act(() => {
      result.current.removeConnection('belt-1:out', 'belt-2:in')
    })
    expect(result.current.connections).toHaveLength(0)
  })
})
