import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ArrivalTelegram, SimulationClient, SimulationEvent } from './simulationClient'
import type { CanvasLayout, Component } from './types'
import { DEFAULT_END_OF_TELEGRAM, SEED_TELEGRAM_TYPES } from '../telegrams/defaults'
import type { TelegramType } from '../telegrams/types'
import { useCanvasLayout, STORAGE_KEY } from './useCanvasLayout'

/** Records reported arrivals and lets the test push authoritative TO/fault events. */
class FakeSimulationClient implements SimulationClient {
  readonly arrivals: Array<{ transportUnitId: string; messagePointId: string }> = []
  /** Encoded telegrams supplied with each arrival, in the same order as {@link arrivals}. */
  readonly arrivalTelegrams: Array<ArrivalTelegram | undefined> = []
  private readonly listeners = new Set<(event: SimulationEvent) => void>()

  reportArrival(
    transportUnitId: string,
    messagePointId: string,
    telegram?: ArrivalTelegram,
  ): Promise<void> {
    this.arrivals.push({ transportUnitId, messagePointId })
    this.arrivalTelegrams.push(telegram)
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

/** Hermetic telegram registry: always the seeds, independent of localStorage. */
const seedRegistry = () => ({ types: SEED_TELEGRAM_TYPES, endOfTelegram: DEFAULT_END_OF_TELEGRAM })

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

// Bins originate only from a Bin Source; it feeds belt-1, so a spawned bin lands
// at the belt's left edge (108, 212) — right over the MP sensor above.
const binSource: Component = {
  id: 'src-1',
  kind: 'bin-source',
  label: 'Source',
  position: { x: 40, y: 200 },
  rotation: 0,
  geometry: { lengthMeters: 1, widthMeters: 1 },
  ports: [{ id: 'src-1:out', role: 'out' }],
}

function seedLayout(): CanvasLayout {
  return {
    schemaVersion: 1,
    units: { pixelsPerMeter: 40, lengthUnit: 'm' },
    components: [binSource, belt, mpSensor],
    connections: [
      { from: 'src-1:out', to: 'belt-1:in' },
      { from: 'belt-1:out', to: 'mp-1:in' },
    ],
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

  it('sends the sensor\'s complete encoded telegram with the seeded MP arrival', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client, seedRegistry))

    act(() => {
      result.current.spawnBin()
    })
    const tuId = result.current.bins[0].tuId

    // Block/release path is unchanged: still one arrival for this bin at MP1.
    expect(client.arrivals).toEqual([{ transportUnitId: tuId, messagePointId: 'MP1' }])

    // ADR-0009: the arrival carries a frontend-minted correlation id and the full
    // encoded telegram bytes (the id already encoded into the reserved slot); the
    // backend relays those bytes verbatim.
    expect(client.arrivalTelegrams).toHaveLength(1)
    const telegram = client.arrivalTelegrams[0]
    expect(telegram).toBeDefined()
    expect(telegram?.telegramId).toBe(1)
    expect(telegram?.payload?.length ?? 0).toBeGreaterThan(0)
    // TelegramId sits after Sender(2) + Receiver(2) => offset 4, INT width 2 = id 1.
    expect(telegram?.payload?.slice(4, 6)).toEqual([0x00, 0x01])
  })

  it('mints a prefix-free transport-unit id sized to the bound TU field', () => {
    // A registry whose MP type carries an 8-byte TU field the sensor binds bin.tuId to.
    // The minted id must drop the old `TU-` prefix and be exactly that field's width.
    const registryWithTu = () => {
      const mp = SEED_TELEGRAM_TYPES.find((type) => type.code === 'MP')!
      const withTu: TelegramType = {
        ...mp,
        groups: mp.groups.map((group, index) =>
          index === 0
            ? {
                ...group,
                fields: [
                  ...group.fields,
                  { id: 'mp-tu', name: 'TU', dataType: 'STRING', length: 8, defaultValue: '' },
                ],
              }
            : group,
        ),
      }
      return { types: [withTu], endOfTelegram: DEFAULT_END_OF_TELEGRAM }
    }

    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client, registryWithTu))

    act(() => {
      result.current.spawnBin()
    })

    const tuId = result.current.bins[0].tuId
    expect(tuId).not.toContain('TU-')
    expect(tuId).toMatch(/^[0-9A-Z]{8}$/)
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

  it('holds a blocked bin (does not release) when its pending request faults', () => {
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

    // A fault is a non-releasing signal (ADR-0012): the bin stays held at the MP and
    // is flagged timed-out (drawn distinctly) rather than moving on without a TO.
    expect(result.current.awaitingTo.has(tuId)).toBe(true)
    expect(result.current.bins[0].timedOut).toBe(true)
  })

  it('stores the telegram id from an mpReported event on the matching bin', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    const tuId = result.current.bins[0].tuId
    expect(result.current.bins[0].telegramId).toBeUndefined()

    act(() => {
      client.emit({
        type: 'mpReported',
        report: { telegramId: 7, transportUnitId: tuId, messagePointId: 'MP1' },
      })
    })

    expect(result.current.bins[0].telegramId).toBe(7)
  })

  it('stores destinationMp and releases the bin when its transport order arrives', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    const tuId = result.current.bins[0].tuId
    expect(result.current.awaitingTo.has(tuId)).toBe(true)

    act(() => {
      client.emit({
        type: 'transportOrder',
        order: {
          telegramId: 1,
          transportUnitId: tuId,
          messagePointId: 'MP1',
          destination: 'DEST-A',
          destinationMp: 'MP2',
        },
      })
    })

    // The authoritative reply carries the next MP and releases the bin toward it.
    expect(result.current.awaitingTo.has(tuId)).toBe(false)
    expect(result.current.bins[0].destinationMp).toBe('MP2')
    expect(result.current.bins[0].timedOut).toBe(false)
  })

  it('clears awaiting state and pending reports on stop', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })
    const tuId = result.current.bins[0].tuId
    expect(result.current.awaitingTo.size).toBe(1)

    // Fault the bin so it is held + timed-out, then confirm stop clears every trace.
    act(() => {
      client.emit({
        type: 'fault',
        fault: { telegramId: 1, transportUnitId: tuId, messagePointId: 'MP1', reason: 'to' },
      })
    })
    expect(result.current.bins[0].timedOut).toBe(true)

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
    // A 5 m × 1 m belt is 200 × 40 px at 40 ppm, so centring offsets by half.
    expect(added.position).toEqual({ x: 500 - 100, y: 300 - 20 })
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

  it('tracks and persists an orientation (rotation) edit through apply', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.selectNode('belt-1')
    })
    expect(result.current.isDirty).toBe(false)

    act(() => {
      result.current.updateDraft({ rotation: 90 })
    })
    expect(result.current.draft?.rotation).toBe(90)
    expect(result.current.isDirty).toBe(true)

    act(() => {
      result.current.applyDraft()
    })
    const belt = result.current.components.find((component) => component.id === 'belt-1')
    expect(belt?.rotation).toBe(90)
    expect(result.current.isDirty).toBe(false)
  })
})

describe('useCanvasLayout spawning', () => {
  it('spawns a bin from the bin source onto the belt it feeds', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.spawnBin()
    })

    expect(result.current.bins).toHaveLength(1)
    // Enters at the fed belt's in-anchor (route start), where dist === 0.
    expect(result.current.bins[0].x).toBe(100)
    expect(result.current.bins[0].y).toBe(212)
    expect(result.current.bins[0].dist).toBe(0)
  })

  it('rides a rotated (downward) belt along +y, not +x', () => {
    const client = new FakeSimulationClient()
    const verticalBelt: Component = {
      id: 'vbelt',
      kind: 'straight-belt',
      label: 'Down',
      position: { x: 200, y: 100 },
      rotation: 90,
      geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
      ports: [
        { id: 'vbelt:in', role: 'in' },
        { id: 'vbelt:out', role: 'out' },
      ],
      transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
    }
    const layout: CanvasLayout = {
      ...seedLayout(),
      components: [binSource, verticalBelt],
      connections: [{ from: 'src-1:out', to: 'vbelt:in' }],
    }
    const { result } = renderHook(() => useCanvasLayout(layout, client))

    act(() => {
      result.current.spawnBin()
    })
    const startX = result.current.bins[0].x
    const startY = result.current.bins[0].y

    // One act per tick so React commits the moved bins between frames.
    act(() => {
      result.current.tick(100)
    })
    act(() => {
      result.current.tick(100)
    })

    const bin = result.current.bins[0]
    expect(bin.y).toBeGreaterThan(startY) // travels down the rotated belt
    expect(bin.x).toBeCloseTo(startX) // no sideways +x drift
  })

  it('removes a bin once it reaches a connected sink (out of the system)', () => {
    const client = new FakeSimulationClient()
    const straight: Component = {
      id: 'belt-1',
      kind: 'straight-belt',
      label: 'Belt',
      position: { x: 100, y: 100 },
      rotation: 0,
      geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
      ports: [
        { id: 'belt-1:in', role: 'in' },
        { id: 'belt-1:out', role: 'out' },
      ],
      transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
    }
    const sinkComp: Component = {
      id: 'sink-1',
      kind: 'sink',
      label: 'Sink',
      position: { x: 300, y: 100 },
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-1:in', role: 'in' }],
    }
    const layout: CanvasLayout = {
      ...seedLayout(),
      components: [binSource, straight, sinkComp],
      connections: [
        { from: 'src-1:out', to: 'belt-1:in' },
        { from: 'belt-1:out', to: 'sink-1:in' },
      ],
    }
    const { result } = renderHook(() => useCanvasLayout(layout, client))

    act(() => {
      result.current.spawnBin()
    })
    expect(result.current.bins).toHaveLength(1)

    // Drive the sim until the bin travels the belt and enters the sink (one act per tick).
    for (let i = 0; i < 200 && result.current.bins.length > 0; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }
    expect(result.current.bins).toHaveLength(0)
  })

  it('removes a bin at its sink even when the layout has several sinks', () => {
    const client = new FakeSimulationClient()
    const straight: Component = {
      id: 'belt-1',
      kind: 'straight-belt',
      label: 'Belt',
      position: { x: 100, y: 100 },
      rotation: 0,
      geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
      ports: [
        { id: 'belt-1:in', role: 'in' },
        { id: 'belt-1:out', role: 'out' },
      ],
      transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
    }
    const sinkOther: Component = {
      id: 'sink-other',
      kind: 'sink',
      label: 'Sink',
      position: { x: 600, y: 400 }, // a second sink elsewhere in the same area
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-other:in', role: 'in' }],
    }
    const sinkTerminal: Component = {
      id: 'sink-terminal',
      kind: 'sink',
      label: 'Sink',
      position: { x: 300, y: 100 }, // the sink this belt actually feeds
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-terminal:in', role: 'in' }],
    }
    const layout: CanvasLayout = {
      ...seedLayout(),
      components: [binSource, straight, sinkOther, sinkTerminal],
      connections: [
        { from: 'src-1:out', to: 'belt-1:in' },
        { from: 'belt-1:out', to: 'sink-terminal:in' },
      ],
    }
    const { result } = renderHook(() => useCanvasLayout(layout, client))

    act(() => {
      result.current.spawnBin()
    })
    expect(result.current.bins).toHaveLength(1)

    for (let i = 0; i < 200 && result.current.bins.length > 0; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }
    expect(result.current.bins).toHaveLength(0) // vanished at its sink despite another sink present
  })

  it('removes a bin at a sink dropped at the belt end without a port connection', () => {
    // The real-UI failure: a Sink placed flush at the end of the line but not port-snapped.
    // The belt's out port is unconnected, yet the bin must still drain into the sink.
    const client = new FakeSimulationClient()
    const straight: Component = {
      id: 'belt-1',
      kind: 'straight-belt',
      label: 'Belt',
      position: { x: 100, y: 100 },
      rotation: 0,
      geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
      ports: [
        { id: 'belt-1:in', role: 'in' },
        { id: 'belt-1:out', role: 'out' },
      ],
      transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
    }
    const sinkComp: Component = {
      id: 'sink-1',
      kind: 'sink',
      label: 'Sink',
      position: { x: 310, y: 90 }, // sits just past the belt end, ~10 px gap, NOT connected
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-1:in', role: 'in' }],
    }
    const layout: CanvasLayout = {
      ...seedLayout(),
      components: [binSource, straight, sinkComp],
      // Only the source feeds the belt — the belt's out port is left unconnected.
      connections: [{ from: 'src-1:out', to: 'belt-1:in' }],
    }
    const { result } = renderHook(() => useCanvasLayout(layout, client))

    act(() => {
      result.current.spawnBin()
    })
    expect(result.current.bins).toHaveLength(1)

    for (let i = 0; i < 200 && result.current.bins.length > 0; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }
    expect(result.current.bins).toHaveLength(0) // proximity delivery drains the unconnected sink
  })

  it('does not spawn a bin when there is no bin source', () => {
    const client = new FakeSimulationClient()
    const noSource: CanvasLayout = {
      ...seedLayout(),
      components: [belt, mpSensor],
      connections: [{ from: 'belt-1:out', to: 'mp-1:in' }],
    }
    const { result } = renderHook(() => useCanvasLayout(noSource, client))

    act(() => {
      result.current.spawnBin()
    })

    expect(result.current.bins).toHaveLength(0)
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

  it('snapComponent snaps a dragged belt flush and forms the connection', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(twoBeltSeed(), client))

    // belt-1:out world is {300, 220}; dropping belt-2 at {300, 200} lands its
    // in-port there, so the two pieces click together and link.
    act(() => {
      result.current.snapComponent('belt-2', { x: 300, y: 200 })
    })

    expect(result.current.components.find((component) => component.id === 'belt-2')?.position).toEqual({
      x: 300,
      y: 200,
    })
    expect(result.current.connections).toEqual([{ from: 'belt-1:out', to: 'belt-2:in' }])
  })

  it('snapComponent disconnects a belt dragged away from its neighbour', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(twoBeltSeed(), client))

    act(() => {
      result.current.snapComponent('belt-2', { x: 300, y: 200 })
    })
    expect(result.current.connections).toHaveLength(1)

    // Pull belt-2 far away — the seam separates beyond the snap distance.
    act(() => {
      result.current.snapComponent('belt-2', { x: 900, y: 600 })
    })
    expect(result.current.connections).toHaveLength(0)
  })

  it('snapComponent updates the draft position of the selected component', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(twoBeltSeed(), client))

    act(() => {
      result.current.selectNode('belt-2')
    })
    act(() => {
      result.current.snapComponent('belt-2', { x: 300, y: 200 })
    })

    expect(result.current.draft?.position).toEqual({ x: 300, y: 200 })
  })
})

describe('useCanvasLayout bin source pool', () => {
  it('adds a bin type with sensible defaults and updates the total', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))
    expect(result.current.binCount).toBe(5) // seed pool: TOTE × 5

    act(() => {
      result.current.addBinType()
    })

    const types = result.current.binSource.types
    expect(types).toHaveLength(2)
    expect(types[1]).toMatchObject({ typeId: 'BIN', count: 1 })
    expect(result.current.binCount).toBe(6)
  })

  it('updates a bin type and recomputes the total', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.updateBinType(0, { typeId: 'CARTON', count: 3 })
    })

    expect(result.current.binSource.types[0]).toMatchObject({ typeId: 'CARTON', count: 3 })
    expect(result.current.binCount).toBe(3)
  })

  it('removes a bin type by index', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.addBinType()
    })
    expect(result.current.binSource.types).toHaveLength(2)

    act(() => {
      result.current.removeBinType(0) // drop the seed TOTE, keep the added BIN
    })

    expect(result.current.binSource.types).toHaveLength(1)
    expect(result.current.binSource.types[0].typeId).toBe('BIN')
    expect(result.current.binCount).toBe(1)
  })

  it('picks a unique default id when BIN already exists', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.addBinType() // BIN
      result.current.addBinType() // BIN-2 (BIN taken)
    })

    const ids = result.current.binSource.types.map((type) => type.typeId)
    expect(ids).toContain('BIN')
    expect(ids).toContain('BIN-2')
  })

  it('updates the bin-source distance-between-bins (spacingMeters), clamped at 0', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), client))

    act(() => {
      result.current.updateBinSpacing(1.25)
    })
    expect(result.current.binSource.spacingMeters).toBe(1.25)

    act(() => {
      result.current.updateBinSpacing(-4) // negative distances make no sense
    })
    expect(result.current.binSource.spacingMeters).toBe(0)
  })
})

describe('useCanvasLayout pool auto-release', () => {
  // Bin source → belt with no sensor, so released bins move off the entry freely
  // (nothing blocks them), letting the queue drain one spaced bin at a time.
  function releaseSeed(count: number): CanvasLayout {
    return {
      ...seedLayout(),
      components: [binSource, belt],
      connections: [{ from: 'src-1:out', to: 'belt-1:in' }],
      binSource: { id: 'src', types: [{ typeId: 'TOTE', color: '#3b82f6', count }] },
    }
  }

  it('releases a pooled bin at the source entry once running', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(releaseSeed(2), client))

    act(() => {
      result.current.play()
    })
    act(() => {
      result.current.tick(100)
    })

    expect(result.current.bins).toHaveLength(1)
  })

  it('does not release a second bin until the entry clears (spacing)', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(releaseSeed(2), client))

    act(() => {
      result.current.play()
    })
    act(() => {
      result.current.tick(100) // first bin released at the entry
    })
    act(() => {
      result.current.tick(100) // entry still occupied → no second release yet
    })

    expect(result.current.bins).toHaveLength(1)
  })

  it('drains the whole pool over time and then stops (exhaustion)', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(releaseSeed(2), client))

    act(() => {
      result.current.play()
    })
    // One tick per act mirrors the rAF loop (a render commits between frames, so the
    // spacing check sees the previously released bin). A bin advances ≤6 px/tick and
    // the entry gap is 28 px, so several ticks pass between releases.
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }
    expect(result.current.bins).toHaveLength(2)

    // Pool is empty — further ticks never release a third bin.
    for (let i = 0; i < 20; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }
    expect(result.current.bins).toHaveLength(2)
  })

  it('holds the pool when the first bin blocks at the entry MP (backpressure)', () => {
    const client = new FakeSimulationClient()
    // Default seed: the MP sensor sits over the entry, so the released bin blocks
    // awaiting its TO. With the passive client no TO arrives, so nothing else releases.
    const seed: CanvasLayout = {
      ...seedLayout(),
      binSource: { id: 'src', types: [{ typeId: 'TOTE', color: '#3b82f6', count: 3 }] },
    }
    const { result } = renderHook(() => useCanvasLayout(seed, client))

    act(() => {
      result.current.play()
    })
    for (let i = 0; i < 6; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }

    expect(result.current.bins).toHaveLength(1)
    expect(result.current.awaitingTo.size).toBe(1)
  })

  it('shrinks the source count as bins are released and restores it on stop', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(releaseSeed(2), client))

    expect(result.current.binsRemaining).toBe(2) // full pool before starting

    act(() => {
      result.current.play()
    })
    act(() => {
      result.current.tick(100) // release the first bin
    })
    expect(result.current.binsRemaining).toBe(1)

    // Advance until the entry clears so the second (last) bin releases.
    for (let i = 0; i < 8; i += 1) {
      act(() => {
        result.current.tick(100)
      })
    }
    expect(result.current.binsRemaining).toBe(0)

    act(() => {
      result.current.stop()
    })
    expect(result.current.binsRemaining).toBe(2) // pool restored on reset
  })

  it('clears the release queue on stop', () => {
    const client = new FakeSimulationClient()
    const { result } = renderHook(() => useCanvasLayout(releaseSeed(3), client))

    act(() => {
      result.current.play()
    })
    act(() => {
      result.current.tick(100) // release one
    })
    expect(result.current.bins).toHaveLength(1)

    act(() => {
      result.current.stop()
    })
    expect(result.current.bins).toHaveLength(0)

    // Re-playing rebuilds the queue from the pool; a tick releases afresh.
    act(() => {
      result.current.play()
    })
    act(() => {
      result.current.tick(100)
    })
    expect(result.current.bins).toHaveLength(1)
  })

  it('spaces released bins by the Bin Source distance: a wider gap releases fewer over the same ticks', () => {
    // Baseline: the default 0.3 m gap (28 px) lets the queue drain a few bins over 12 ticks.
    const baseClient = new FakeSimulationClient()
    const base = renderHook(() => useCanvasLayout(releaseSeed(3), baseClient))
    act(() => {
      base.result.current.play()
    })
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        base.result.current.tick(100)
      })
    }
    const baseReleased = base.result.current.bins.length
    expect(baseReleased).toBeGreaterThanOrEqual(2)

    // A much wider gap (3 m → 136 px) never clears the entry within 12 ticks, so only
    // the initial bin is released — the distance genuinely throttles the release cadence.
    const wideClient = new FakeSimulationClient()
    const wide = renderHook(() => useCanvasLayout(releaseSeed(3), wideClient))
    act(() => {
      wide.result.current.updateBinSpacing(3)
    })
    act(() => {
      wide.result.current.play()
    })
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        wide.result.current.tick(100)
      })
    }
    expect(wide.result.current.bins).toHaveLength(1)
    expect(wide.result.current.bins.length).toBeLessThan(baseReleased)
  })
})

describe('useCanvasLayout multi-selection', () => {
  it('selects several components via selectNodes (no single inspector target)', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.selectNodes(['belt-1', 'mp-1'])
    })

    expect(result.current.selectedIds.has('belt-1')).toBe(true)
    expect(result.current.selectedIds.has('mp-1')).toBe(true)
    expect(result.current.selectedIds.size).toBe(2)
    // A multi-selection has no single inspector target.
    expect(result.current.selectedId).toBeNull()
    expect(result.current.draft).toBeNull()
  })

  it('selects a single component via selectNodes and opens the inspector', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.selectNodes(['belt-1'])
    })

    expect(result.current.selectedId).toBe('belt-1')
    expect(result.current.selectedIds.has('belt-1')).toBe(true)
    expect(result.current.draft?.id).toBe('belt-1')
  })

  it('ignores unknown ids passed to selectNodes', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.selectNodes(['belt-1', 'does-not-exist'])
    })

    expect([...result.current.selectedIds]).toEqual(['belt-1'])
  })

  it('removeSelected deletes every selected component and prunes their connections', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.selectNodes(['belt-1', 'mp-1'])
    })
    act(() => {
      result.current.removeSelected()
    })

    expect(result.current.components.map((component) => component.id)).toEqual(['src-1'])
    // Both seed connections reference a removed port, so both are dropped.
    expect(result.current.connections).toHaveLength(0)
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.selectedId).toBeNull()
  })

  it('removeSelected is a no-op when nothing is selected', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.clearSelection()
    })
    const before = result.current.components.length
    act(() => {
      result.current.removeSelected()
    })

    expect(result.current.components).toHaveLength(before)
  })
})

describe('useCanvasLayout deferred save', () => {
  it('is not dirty on first render', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))
    expect(result.current.hasUnsavedChanges).toBe(false)
  })

  it('flags unsaved changes after an edit and clears them on save', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.addComponent('straight-belt')
    })
    expect(result.current.hasUnsavedChanges).toBe(true)

    let saved = false
    act(() => {
      saved = result.current.saveLayout()
    })

    expect(saved).toBe(true)
    expect(result.current.hasUnsavedChanges).toBe(false)
  })

  it('does not persist edits to storage until saveLayout is called', () => {
    localStorage.clear()
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.selectNodes(['belt-1'])
    })
    act(() => {
      result.current.removeSelected()
    })

    // The delete is live in memory but nothing is written to storage yet.
    expect(result.current.components.some((component) => component.id === 'belt-1')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    act(() => {
      result.current.saveLayout()
    })

    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(stored).not.toContain('belt-1')
  })

  it('treats an imported layout as the saved baseline (not dirty)', () => {
    const { result } = renderHook(() => useCanvasLayout(seedLayout(), new FakeSimulationClient()))

    act(() => {
      result.current.addComponent('sink')
    })
    expect(result.current.hasUnsavedChanges).toBe(true)

    const json = result.current.exportLayout()
    act(() => {
      result.current.importLayout(json)
    })

    expect(result.current.hasUnsavedChanges).toBe(false)
  })
})
