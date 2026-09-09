import { describe, expect, it } from 'vitest'
import { defaultLayout } from './defaults'
import {
  advance,
  applyComponentSnap,
  beltCenterline,
  beltWidthPx,
  buildRoute,
  canConnect,
  componentPorts,
  componentRect,
  componentSizePx,
  componentsInMarquee,
  curveGeometry,
  DEFAULT_TU_ID_LENGTH,
  defaultComponent,
  emptyLayout,
  metersToPx,
  nearestComponentSnap,
  nearestConnectablePort,
  nextTuId,
  normalizeRect,
  orderedMpIdsAlongRoute,
  parseLayout,
  pointAtDistance,
  PORT_SNAP_DISTANCE_PX,
  portsWithWorld,
  portWorldPos,
  pxToMeters,
  resolvePortWorld,
  serializeLayout,
  toComponentKind,
  validateCanvasLayout,
} from './layout'
import type { Bin, CanvasLayout, Component, ComponentKind, Vec2 } from './types'

const UNITS = { pixelsPerMeter: 40, lengthUnit: 'm' }

describe('toComponentKind', () => {
  it('returns the kind for a known value', () => {
    expect(toComponentKind('straight-belt')).toBe('straight-belt')
    expect(toComponentKind('mp-sensor')).toBe('mp-sensor')
  })

  it('returns null for an unknown value', () => {
    expect(toComponentKind('not-a-kind')).toBeNull()
    expect(toComponentKind('')).toBeNull()
  })
})

describe('nextTuId', () => {
  it('generates a prefix-free transport-unit id of the requested length', () => {
    // No `TU-` prefix (removed): the id is only the auto-generated characters, and its
    // width matches the telegram field that will carry it so it fills the slot exactly.
    expect(nextTuId(8)).toMatch(/^[0-9A-Z]{8}$/)
    expect(nextTuId(2)).toHaveLength(2)
    expect(nextTuId(6)).not.toContain('TU-')
  })

  it('falls back to the default width for a non-positive or non-integer length', () => {
    expect(nextTuId(0)).toHaveLength(DEFAULT_TU_ID_LENGTH)
    expect(nextTuId(-4)).toHaveLength(DEFAULT_TU_ID_LENGTH)
    expect(nextTuId(3.5)).toHaveLength(DEFAULT_TU_ID_LENGTH)
  })
})

describe('unit conversion', () => {
  it('converts metres to pixels at the layout scale', () => {
    expect(metersToPx(5, UNITS)).toBe(200)
    expect(metersToPx(0, UNITS)).toBe(0)
  })

  it('converts pixels back to metres, guarding a zero scale', () => {
    expect(pxToMeters(200, UNITS)).toBe(5)
    expect(pxToMeters(200, { pixelsPerMeter: 0, lengthUnit: 'm' })).toBe(0)
  })
})

describe('validateCanvasLayout', () => {
  it('accepts a valid layout and reports no errors', () => {
    const result = validateCanvasLayout(defaultLayout())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.errors).toEqual([])
    expect(result.layout).toEqual(defaultLayout())
  })

  it('falls back to full defaults for an empty object', () => {
    const result = validateCanvasLayout({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout).toEqual(emptyLayout())
    expect(result.errors).toEqual([])
  })

  it('rejects non-object input without ever throwing', () => {
    for (const bad of [null, undefined, 42, 'nope', true, []]) {
      expect(() => validateCanvasLayout(bad)).not.toThrow()
      const result = validateCanvasLayout(bad)
      expect(result.ok).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('tolerates unknown fields by ignoring them', () => {
    const result = validateCanvasLayout({
      schemaVersion: 1,
      surprise: 'ignored',
      units: { pixelsPerMeter: 50, lengthUnit: 'mm', extra: true },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout).not.toHaveProperty('surprise')
    expect(result.layout.units).toEqual({ pixelsPerMeter: 50, lengthUnit: 'mm' })
  })

  it('drops invalid component entries and reports them', () => {
    const result = validateCanvasLayout({
      components: [
        { id: 'ok-1', kind: 'straight-belt' },
        { id: 'no-kind' },
        { kind: 'straight-belt' },
        null,
        42,
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.components).toHaveLength(1)
    expect(result.layout.components[0].id).toBe('ok-1')
    expect(result.errors.length).toBe(4)
  })
})

describe('bin source spacing (distance between bins)', () => {
  it('defaults spacingMeters to 0.3 when the bin source omits it', () => {
    const result = validateCanvasLayout({ binSource: { id: 'src', types: [] } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.binSource.spacingMeters).toBe(0.3)
  })

  it('preserves a valid custom spacingMeters', () => {
    const result = validateCanvasLayout({ binSource: { id: 'src', types: [], spacingMeters: 1.5 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.binSource.spacingMeters).toBe(1.5)
  })

  it('falls back to 0.3 for an invalid spacingMeters (negative / non-number)', () => {
    for (const bad of [-1, Number.NaN, 'wide', null]) {
      const result = validateCanvasLayout({ binSource: { id: 'src', types: [], spacingMeters: bad } })
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.layout.binSource.spacingMeters).toBe(0.3)
    }
  })

  it('round-trips a custom spacing through serialise → parse', () => {
    const layout: CanvasLayout = {
      ...emptyLayout(),
      binSource: { id: 'src', types: [], spacingMeters: 0.8 },
    }
    const result = parseLayout(serializeLayout(layout))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.binSource.spacingMeters).toBe(0.8)
  })
})


describe('(de)serialisation', () => {
  it('round-trips a layout through serialise → parse unchanged', () => {
    const layout = defaultLayout()
    const result = parseLayout(serializeLayout(layout))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout).toEqual(layout)
  })

  it('fails safely on malformed JSON', () => {
    const result = parseLayout('{ not json ]')
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('defaultComponent', () => {
  it('builds a transport belt with transport props and two ports', () => {
    const belt = defaultComponent('straight-belt', 1)
    expect(belt.kind).toBe('straight-belt')
    expect(belt.transport).toEqual({ speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 })
    expect(belt.sensor).toBeUndefined()
    expect(belt.ports).toHaveLength(2)
    expect(belt.geometry.lengthMeters).toBeGreaterThan(0)
  })

  it('builds an MP sensor with a bound telegram and no transport', () => {
    const sensor = defaultComponent('mp-sensor', 3)
    expect(sensor.kind).toBe('mp-sensor')
    expect(sensor.transport).toBeUndefined()
    expect(sensor.sensor?.telegramTypeId).toBe('MP')
    expect(sensor.sensor?.mpId).toBe('MP3')
    expect(sensor.sensor?.fieldBindings).toEqual([
      { field: 'MP', source: 'mpId' },
      { field: 'TU', source: 'bin.tuId' },
    ])
  })
})

describe('advance (transient preview motion)', () => {
  const bin = (id: string, x: number, y: number): Bin => ({
    id,
    tuId: `TU-${id}`,
    typeId: 'TOTE',
    color: '#3b82f6',
    x,
    y,
  })

  it('moves bins along +x by the scaled step', () => {
    const result = advance({
      bins: [bin('a', 10, 100)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
    })
    expect(result.bins).toHaveLength(1)
    expect(result.bins[0].x).toBeCloseTo(16)
  })

  it('drops bins that travel past maxX', () => {
    const result = advance({
      bins: [bin('a', 998, 100)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
    })
    expect(result.bins).toHaveLength(0)
  })

  it('removes a bin that reaches a sink', () => {
    const result = advance({
      bins: [bin('a', 500, 100)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
      sinks: [{ id: 'sink-1', x: 490, y: 90, width: 40, height: 20 }],
    })
    expect(result.bins).toHaveLength(0)
  })

  it('keeps a bin that has not yet reached a sink', () => {
    const result = advance({
      bins: [bin('a', 10, 100)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
      sinks: [{ id: 'sink-1', x: 900, y: 90, width: 40, height: 20 }],
    })
    expect(result.bins).toHaveLength(1)
  })

  it('flags a sensor a bin currently overlaps', () => {
    const result = advance({
      bins: [bin('a', 10, 100)],
      sensors: [{ id: 'mp-1', x: 0, y: 90, width: 40, height: 20 }],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
    })
    expect(result.triggered.has('mp-1')).toBe(true)
  })

  it('does not flag a sensor no bin reaches', () => {
    const result = advance({
      bins: [bin('a', 10, 100)],
      sensors: [{ id: 'far', x: 500, y: 90, width: 40, height: 20 }],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
    })
    expect(result.triggered.has('far')).toBe(false)
  })

  it('holds a bin awaiting its transport order in place', () => {
    const blockedBin = bin('a', 50, 100)
    const result = advance({
      bins: [blockedBin],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
      blocked: new Set([blockedBin.tuId]),
    })
    expect(result.bins[0].x).toBe(50)
  })

  it('queues a trailing bin behind a blocked bin on the same lane', () => {
    const front = bin('front', 100, 100)
    const back = bin('back', 90, 100)
    const result = advance({
      bins: [back, front],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
      blocked: new Set([front.tuId]),
      minGapPx: 8,
    })
    const byId = Object.fromEntries(result.bins.map((entry) => [entry.id, entry]))
    expect(byId.front.x).toBe(100) // blocked: held in place
    expect(byId.back.x).toBeCloseTo(92) // clamped to the min gap behind the front
  })

  it('lets a trailing bin on a different lane pass a blocked bin', () => {
    const front = bin('front', 100, 100)
    const back = bin('back', 96, 140) // well outside the lane tolerance
    const result = advance({
      bins: [back, front],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 1000,
      baseSpeedPxPerSec: 60,
      blocked: new Set([front.tuId]),
      minGapPx: 8,
    })
    const byId = Object.fromEntries(result.bins.map((entry) => [entry.id, entry]))
    expect(byId.back.x).toBeCloseTo(102) // unconstrained: different lane
  })
})

describe('beltCenterline', () => {
  it('samples a straight belt as its entry → exit mid-line (two points)', () => {
    const line = beltCenterline(belt('belt-1', 'straight-belt', { x: 100, y: 100 }), UNITS)
    const size = componentSizePx(belt('belt-1'), UNITS)
    expect(line).toEqual([
      { x: 100, y: 100 + size.height / 2 },
      { x: 100 + size.width, y: 100 + size.height / 2 },
    ])
  })

  it('samples a curved belt along its arc so the path turns (many points)', () => {
    const component = belt('c', 'curved-belt', { x: 100, y: 100 })
    const line = beltCenterline(component, UNITS)
    const curve = curveGeometry(component, UNITS)
    expect(line.length).toBeGreaterThan(2)
    // Endpoints land on the curve's entry/exit anchors (world space).
    expect(line[0]).toEqual(portWorldPos(component, curve.inAnchor))
    expect(line[line.length - 1]).toEqual(portWorldPos(component, curve.outAnchor))
    // A 90° bend must change direction: entry and exit are not colinear in x or y.
    const start = line[0]
    const end = line[line.length - 1]
    expect(start.x).not.toBeCloseTo(end.x)
    expect(start.y).not.toBeCloseTo(end.y)
  })
})

/** A bin source with one out port, positioned to feed a belt at {100,100}. */
function source(id = 'src-1', position = { x: 40, y: 100 }): Component {
  return {
    id,
    kind: 'bin-source',
    label: id,
    position,
    rotation: 0,
    geometry: { lengthMeters: 1, widthMeters: 1 },
    ports: [{ id: `${id}:out`, role: 'out' }],
  }
}

function routedLayout(
  components: Component[],
  connections: CanvasLayout['connections'],
): CanvasLayout {
  return {
    schemaVersion: 1,
    units: UNITS,
    components,
    connections,
    binSource: { id: 'src', types: [] },
    areas: [],
    controlLogic: { minBinDistanceMeters: 0.3, conveyorSpeedScale: 1 },
  }
}

describe('buildRoute', () => {
  it('walks the source → belt → belt chain into one centreline path', () => {
    const layout = routedLayout(
      [
        source(),
        belt('belt-1', 'straight-belt', { x: 100, y: 100 }),
        belt('belt-2', 'straight-belt', { x: 400, y: 100 }),
      ],
      [
        { from: 'src-1:out', to: 'belt-1:in' },
        { from: 'belt-1:out', to: 'belt-2:in' },
      ],
    )
    const route = buildRoute(layout)
    expect(route).not.toBeNull()
    const midY = 100 + componentSizePx(belt('belt-1'), UNITS).height / 2 // 112
    // Enters belt-1's in-anchor, exits belt-2's out-anchor.
    expect(route?.points[0]).toEqual({ x: 100, y: midY })
    expect(route?.points[route.points.length - 1]).toEqual({ x: 600, y: midY })
    // 200 (belt-1) + 100 (gap) + 200 (belt-2).
    expect(route?.length).toBeCloseTo(500)
  })

  it('returns null when there is no bin source', () => {
    expect(buildRoute(twoBeltLayout([{ from: 'belt-1:out', to: 'belt-2:in' }]))).toBeNull()
  })

  it('returns null when the source feeds no transport component', () => {
    const layout = routedLayout(
      [source(), belt('belt-1', 'straight-belt', { x: 100, y: 100 })],
      [], // source not connected to the belt
    )
    expect(buildRoute(layout)).toBeNull()
  })

  it('stops at a cycle instead of looping forever', () => {
    const layout = routedLayout(
      [
        source(),
        belt('belt-1', 'straight-belt', { x: 100, y: 100 }),
        belt('belt-2', 'straight-belt', { x: 400, y: 100 }),
      ],
      [
        { from: 'src-1:out', to: 'belt-1:in' },
        { from: 'belt-1:out', to: 'belt-2:in' },
        { from: 'belt-2:out', to: 'belt-1:in' }, // cycle back
      ],
    )
    const route = buildRoute(layout)
    expect(route).not.toBeNull()
    // Each belt is visited once: belt-1 then belt-2, then the walk stops.
    expect(route?.length).toBeCloseTo(500)
  })

  it('turns the path when a curved belt is in the chain', () => {
    const layout = routedLayout(
      [source(), belt('c', 'curved-belt', { x: 100, y: 100 })],
      [{ from: 'src-1:out', to: 'c:in' }],
    )
    const route = buildRoute(layout)
    expect(route).not.toBeNull()
    const start = route!.points[0]
    const end = route!.points[route!.points.length - 1]
    // A curve bends the path: the exit is offset from the entry in both axes.
    expect(start.x).not.toBeCloseTo(end.x)
    expect(start.y).not.toBeCloseTo(end.y)
  })

  it('carries the path into a connected sink and flags the route end', () => {
    const sinkComp: Component = {
      id: 'sink-1',
      kind: 'sink',
      label: 'Sink',
      position: { x: 320, y: 100 },
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-1:in', role: 'in' }],
    }
    const layout = routedLayout(
      [source(), belt('belt-1', 'straight-belt', { x: 100, y: 100 }), sinkComp],
      [
        { from: 'src-1:out', to: 'belt-1:in' },
        { from: 'belt-1:out', to: 'sink-1:in' },
      ],
    )
    const route = buildRoute(layout)
    expect(route?.endsAtSink).toBe(true)
    // The path ends at the sink's centre so a bin visibly enters it before it vanishes.
    const size = componentSizePx(sinkComp, UNITS)
    expect(route?.points[route.points.length - 1]).toEqual({
      x: 320 + size.width / 2,
      y: 100 + size.height / 2,
    })
  })

  it('delivers into a sink sitting at the belt end even without a port connection', () => {
    // A Sink dropped flush at the end of the line but not quite port-snapped: the belt's
    // out port is unconnected, yet bins must still drain into the adjacent sink.
    const sinkComp: Component = {
      id: 'sink-1',
      kind: 'sink',
      label: 'Sink',
      position: { x: 310, y: 90 },
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-1:in', role: 'in' }],
    }
    const layout = routedLayout(
      [source(), belt('belt-1', 'straight-belt', { x: 100, y: 100 }), sinkComp],
      // Only the source feeds the belt — the belt's out port is NOT connected to the sink.
      [{ from: 'src-1:out', to: 'belt-1:in' }],
    )
    const route = buildRoute(layout)
    expect(route?.endsAtSink).toBe(true)
    const size = componentSizePx(sinkComp, UNITS)
    expect(route?.points[route.points.length - 1]).toEqual({
      x: 310 + size.width / 2,
      y: 90 + size.height / 2,
    })
  })

  it('does not invent a sink terminus when the nearest sink is out of catch range', () => {
    const sinkComp: Component = {
      id: 'sink-far',
      kind: 'sink',
      label: 'Sink',
      position: { x: 900, y: 100 },
      rotation: 0,
      geometry: { lengthMeters: 1, widthMeters: 1 },
      ports: [{ id: 'sink-far:in', role: 'in' }],
    }
    const layout = routedLayout(
      [source(), belt('belt-1', 'straight-belt', { x: 100, y: 100 }), sinkComp],
      [{ from: 'src-1:out', to: 'belt-1:in' }],
    )
    const route = buildRoute(layout)
    expect(route?.endsAtSink).toBeFalsy()
  })
})

describe('orderedMpIdsAlongRoute', () => {
  /** An MP sensor with an `mpId`, centred by its 16 px footprint at `position`. */
  function mp(id: string, mpId: string, position: Vec2): Component {
    return {
      id,
      kind: 'mp-sensor',
      label: id,
      position,
      rotation: 0,
      geometry: { lengthMeters: 0.4, widthMeters: 0.4 },
      ports: [],
      sensor: { telegramTypeId: 'MP', mpId, fieldBindings: [] },
    }
  }

  it('returns MP ids in the order a bin meets them along the route (not insertion order)', () => {
    // Two straight belts fed by the source form a left-to-right route; the MP sensors
    // are inserted out of order (B before A) to prove the sort follows the route.
    const layout = routedLayout(
      [
        source(),
        belt('belt-1', 'straight-belt', { x: 100, y: 100 }),
        belt('belt-2', 'straight-belt', { x: 400, y: 100 }),
        mp('mp-b', 'MP-B', { x: 492, y: 104 }), // centre ~ (500,112), over belt-2
        mp('mp-a', 'MP-A', { x: 192, y: 104 }), // centre ~ (200,112), over belt-1
      ],
      [
        { from: 'src-1:out', to: 'belt-1:in' },
        { from: 'belt-1:out', to: 'belt-2:in' },
      ],
    )
    expect(orderedMpIdsAlongRoute(layout)).toEqual(['MP-A', 'MP-B'])
  })

  it('falls back to left-to-right (x) order when no route can be built', () => {
    // No bin source component → buildRoute returns null → order by x. Inserted reversed.
    const layout = routedLayout(
      [
        mp('mp-b', 'MP-B', { x: 500, y: 100 }),
        mp('mp-a', 'MP-A', { x: 100, y: 100 }),
      ],
      [],
    )
    expect(orderedMpIdsAlongRoute(layout)).toEqual(['MP-A', 'MP-B'])
  })

  it('returns an empty array when the layout has no MP sensors', () => {
    const layout = routedLayout(
      [source(), belt('belt-1', 'straight-belt', { x: 100, y: 100 })],
      [{ from: 'src-1:out', to: 'belt-1:in' }],
    )
    expect(orderedMpIdsAlongRoute(layout)).toEqual([])
  })
})

describe('pointAtDistance', () => {
  const route = { points: [{ x: 100, y: 100 }, { x: 100, y: 300 }], cumulative: [0, 200], length: 200 }

  it('returns the start at distance 0 and the end at full length', () => {
    expect(pointAtDistance(route, 0)).toEqual({ x: 100, y: 100 })
    expect(pointAtDistance(route, 200)).toEqual({ x: 100, y: 300 })
  })

  it('interpolates within a segment', () => {
    expect(pointAtDistance(route, 50)).toEqual({ x: 100, y: 150 })
  })

  it('clamps distances outside the route', () => {
    expect(pointAtDistance(route, -20)).toEqual({ x: 100, y: 100 })
    expect(pointAtDistance(route, 999)).toEqual({ x: 100, y: 300 })
  })
})

describe('advance along a route', () => {
  // A purely vertical route, so any motion must be in +y (proving bins follow the
  // belt's orientation rather than always drifting +x).
  const vertical = { points: [{ x: 100, y: 100 }, { x: 100, y: 500 }], cumulative: [0, 400], length: 400 }
  const bin = (id: string, dist: number): Bin => ({
    id,
    tuId: `TU-${id}`,
    typeId: 'TOTE',
    color: '#3b82f6',
    x: 100,
    y: 100 + dist,
    dist,
  })

  it('moves a bin along the route (down a vertical belt), not along +x', () => {
    const result = advance({
      bins: [bin('a', 0)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      route: vertical,
    })
    expect(result.bins[0].x).toBe(100) // no +x drift
    expect(result.bins[0].y).toBeCloseTo(106) // advanced 6 px down the route
    expect(result.bins[0].dist).toBeCloseTo(6)
  })

  it('queues a trailing bin behind one blocked on the route', () => {
    const front = bin('front', 100)
    const back = bin('back', 90)
    const result = advance({
      bins: [back, front],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      blocked: new Set([front.tuId]),
      minGapPx: 8,
      route: vertical,
    })
    const byId = Object.fromEntries(result.bins.map((entry) => [entry.id, entry]))
    expect(byId.front.dist).toBe(100) // blocked: held in place
    expect(byId.back.dist).toBeCloseTo(92) // clamped to the min gap behind the front
  })

  it('parks a bin at the route end without removing it', () => {
    const result = advance({
      bins: [bin('a', 398)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      route: vertical,
    })
    expect(result.bins).toHaveLength(1)
    expect(result.bins[0].dist).toBe(400) // clamped to the route length, still present
  })

  it('removes a bin that reaches the end of a sink-terminated route', () => {
    const result = advance({
      bins: [bin('a', 398)],
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      route: { ...vertical, endsAtSink: true },
    })
    expect(result.bins).toHaveLength(0) // reached the sink at the chain end — out of the system
  })

  it('removes a bin that reaches a sink on the route', () => {
    const result = advance({
      bins: [bin('a', 200)], // world { x: 100, y: 300 }
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      sinks: [{ id: 'sink-1', x: 90, y: 295, width: 40, height: 20 }],
      route: vertical,
    })
    expect(result.bins).toHaveLength(0)
  })

  it('removes a bin over any one of several sinks (not just the first)', () => {
    const result = advance({
      bins: [bin('a', 200)], // world { x: 100, y: 300 }, advances to y ~306
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      sinks: [
        { id: 'sink-far', x: 90, y: 90, width: 40, height: 20 }, // never reached
        { id: 'sink-hit', x: 90, y: 300, width: 40, height: 20 }, // the bin enters this one
      ],
      route: vertical,
    })
    expect(result.bins).toHaveLength(0) // any sink drains the bin, regardless of order
  })

  it('removes a bin whose footprint reaches a sink even if its centre is just outside', () => {
    // The bin centre (x=100) sits just left of the sink (x starts at 105), so a strict
    // centre-in-box test would miss it; the footprint (±10 px) still overlaps → removed.
    const result = advance({
      bins: [bin('a', 200)], // world { x: 100, y: ~306 } after this tick
      sensors: [],
      dtMs: 100,
      speed: 1,
      maxX: 2000,
      baseSpeedPxPerSec: 60,
      sinks: [{ id: 'sink-edge', x: 105, y: 290, width: 40, height: 40 }],
      route: vertical,
    })
    expect(result.bins).toHaveLength(0)
  })
})

function belt(
  id: string,
  kind: ComponentKind = 'straight-belt',
  position = { x: 0, y: 0 },
): Component {
  const curved = kind === 'curved-belt' || kind === 'u-belt'
  return {
    id,
    kind,
    label: id,
    position,
    rotation: 0,
    geometry: curved
      ? { lengthMeters: 1.2, widthMeters: 0.6, curveAngleDeg: kind === 'u-belt' ? 180 : 90, direction: 'east' }
      : { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
    ports: [
      { id: `${id}:in`, role: 'in' },
      { id: `${id}:out`, role: 'out' },
    ],
    transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
  }
}

function twoBeltLayout(connections: CanvasLayout['connections'] = []): CanvasLayout {
  return {
    schemaVersion: 1,
    units: UNITS,
    components: [
      belt('belt-1', 'straight-belt', { x: 100, y: 100 }),
      belt('belt-2', 'straight-belt', { x: 400, y: 100 }),
    ],
    connections: [...connections],
    binSource: { id: 'src', types: [] },
    areas: [],
    controlLogic: { minBinDistanceMeters: 0.3, conveyorSpeedScale: 1 },
  }
}

describe('uniform belt width', () => {
  it('gives every straight-style transport the same belt thickness (0.6 m → 24 px)', () => {
    for (const kind of ['straight-belt', 'incline', 'decline'] as ComponentKind[]) {
      expect(beltWidthPx(belt('x', kind), UNITS)).toBe(24)
      expect(componentSizePx(belt('x', kind), UNITS).height).toBe(24)
    }
  })

  it('sizes a merge box at two belt widths so both input lanes are full width', () => {
    expect(componentSizePx(belt('m', 'merge'), UNITS).height).toBe(48)
  })

  it('renders a curve as a uniform-width band (outer − inner ≈ belt width)', () => {
    const curve = curveGeometry(belt('c', 'curved-belt'), UNITS)
    expect(curve.outerRadius - curve.innerRadius).toBeCloseTo(beltWidthPx(belt('c', 'curved-belt'), UNITS))
    expect(curve.boxWidth).toBeGreaterThan(0)
    expect(curve.boxHeight).toBeGreaterThan(0)
  })
})

describe('sensor sizing', () => {
  it('derives a sensor diameter from geometry.widthMeters (round)', () => {
    const sensor = defaultComponent('mp-sensor', 1)
    // Default 1 m × 40 ppm = 40 px, square.
    expect(componentSizePx(sensor, UNITS)).toEqual({ width: 40, height: 40 })

    const bigger = { ...sensor, geometry: { ...sensor.geometry, widthMeters: 2 } }
    expect(componentSizePx(bigger, UNITS)).toEqual({ width: 80, height: 80 })
  })

  it('clamps a tiny sensor to a clickable minimum', () => {
    const sensor = defaultComponent('mp-sensor', 1)
    const tiny = { ...sensor, geometry: { ...sensor.geometry, widthMeters: 0.05 } }
    expect(componentSizePx(tiny, UNITS).width).toBeGreaterThanOrEqual(10)
  })
})

describe('componentPorts', () => {
  it('places a straight belt in-port at the left edge and out-port at the right edge', () => {
    const ports = componentPorts(belt('belt-1'), UNITS)
    const size = componentSizePx(belt('belt-1'), UNITS)
    const inPort = ports.find((port) => port.role === 'in')
    const outPort = ports.find((port) => port.role === 'out')
    expect(inPort?.pos).toEqual({ x: 0, y: size.height / 2 })
    expect(outPort?.pos).toEqual({ x: size.width, y: size.height / 2 })
  })

  it('places curve ports on the arc centreline entry/exit', () => {
    const component = belt('c', 'curved-belt')
    const curve = curveGeometry(component, UNITS)
    const ports = componentPorts(component, UNITS)
    expect(ports.find((port) => port.role === 'in')?.pos).toEqual(curve.inAnchor)
    expect(ports.find((port) => port.role === 'out')?.pos).toEqual(curve.outAnchor)
  })
})

describe('portWorldPos / resolvePortWorld', () => {
  it('offsets a local anchor by the (unrotated) component position', () => {
    const component = belt('belt-1', 'straight-belt', { x: 100, y: 100 })
    expect(portWorldPos(component, { x: 0, y: 12 })).toEqual({ x: 100, y: 112 })
  })

  it('resolves a port id to its world position, or null when unknown', () => {
    const layout = twoBeltLayout()
    expect(resolvePortWorld(layout.components, UNITS, 'belt-1:out')).toEqual({ x: 300, y: 112 })
    expect(resolvePortWorld(layout.components, UNITS, 'ghost:in')).toBeNull()
  })
})

describe('portsWithWorld / nearestConnectablePort', () => {
  it('resolves every port to its world position', () => {
    const ports = portsWithWorld(twoBeltLayout().components, UNITS)
    expect(ports).toHaveLength(4)
    expect(ports.find((port) => port.id === 'belt-1:out')).toMatchObject({
      role: 'out',
      componentId: 'belt-1',
      world: { x: 300, y: 112 },
    })
  })

  it('snaps a dragged plug to the nearest opposite-role socket within range', () => {
    const ports = portsWithWorld(twoBeltLayout().components, UNITS)
    const target = nearestConnectablePort(ports, 'belt-1:out', 'out', { x: 388, y: 110 }, 30)
    expect(target?.id).toBe('belt-2:in')
  })

  it('ignores same-role, same-component, and out-of-range ports', () => {
    const ports = portsWithWorld(twoBeltLayout().components, UNITS)
    // Pointer on belt-2:out (same role); belt-2:in is 200px away, belt-1 ports are same component.
    expect(nearestConnectablePort(ports, 'belt-1:out', 'out', { x: 600, y: 112 }, 30)).toBeNull()
    // An opposite-role port on the drag's own component is never a target.
    expect(nearestConnectablePort(ports, 'belt-1:out', 'out', { x: 100, y: 112 }, 30)).toBeNull()
  })
})

describe('canConnect', () => {
  it('accepts an out → in link and returns the normalised connection', () => {
    const result = canConnect(twoBeltLayout(), 'belt-1:out', 'belt-2:in')
    expect(result.ok).toBe(true)
    expect(result.connection).toEqual({ from: 'belt-1:out', to: 'belt-2:in' })
  })

  it('normalises a reversed (in → out) drag back to out → in', () => {
    const result = canConnect(twoBeltLayout(), 'belt-2:in', 'belt-1:out')
    expect(result.ok).toBe(true)
    expect(result.connection).toEqual({ from: 'belt-1:out', to: 'belt-2:in' })
  })

  it('rejects same-role, self, duplicate, and unknown links', () => {
    expect(canConnect(twoBeltLayout(), 'belt-1:out', 'belt-2:out').ok).toBe(false)
    expect(canConnect(twoBeltLayout(), 'belt-1:out', 'belt-1:in').ok).toBe(false)
    expect(canConnect(twoBeltLayout(), 'belt-1:out', 'ghost:in').ok).toBe(false)
    const existing = twoBeltLayout([{ from: 'belt-1:out', to: 'belt-2:in' }])
    expect(canConnect(existing, 'belt-1:out', 'belt-2:in').ok).toBe(false)
  })
})

describe('nearestComponentSnap (magnetic puzzle snap)', () => {
  it('snaps a dragged belt so its in-port meets a neighbour out-port', () => {
    const layout = twoBeltLayout()
    const size = componentSizePx(layout.components[0], UNITS)
    // Drag belt-2 so its in-port (local {0, h/2}) lands on belt-1's out-port world.
    const dragged = { x: 100 + size.width, y: 100 }
    const snap = nearestComponentSnap(layout.components, UNITS, 'belt-2', dragged, PORT_SNAP_DISTANCE_PX)
    expect(snap).not.toBeNull()
    expect(snap?.dragPortId).toBe('belt-2:in')
    expect(snap?.targetPortId).toBe('belt-1:out')
    expect(snap?.position.x).toBeCloseTo(100 + size.width)
    expect(snap?.position.y).toBeCloseTo(100)
  })

  it('returns null when no opposite-role port is within range', () => {
    const layout = twoBeltLayout()
    const size = componentSizePx(layout.components[0], UNITS)
    const dragged = { x: 100 + size.width + 100, y: 100 }
    expect(
      nearestComponentSnap(layout.components, UNITS, 'belt-2', dragged, PORT_SNAP_DISTANCE_PX),
    ).toBeNull()
  })

  it('ignores same-role/self ports — a full overlap does not snap', () => {
    const layout = twoBeltLayout()
    // Dropping belt-2 exactly on belt-1 makes only same-role ports coincide.
    expect(
      nearestComponentSnap(layout.components, UNITS, 'belt-2', { x: 100, y: 100 }, PORT_SNAP_DISTANCE_PX),
    ).toBeNull()
  })

  it('returns null for an unknown component id', () => {
    const layout = twoBeltLayout()
    expect(
      nearestComponentSnap(layout.components, UNITS, 'ghost', { x: 0, y: 0 }, PORT_SNAP_DISTANCE_PX),
    ).toBeNull()
  })
})

describe('applyComponentSnap', () => {
  it('places the component and links the snapped pair', () => {
    const layout = twoBeltLayout()
    const size = componentSizePx(layout.components[0], UNITS)
    const position = { x: 100 + size.width, y: 100 }
    const snap = nearestComponentSnap(layout.components, UNITS, 'belt-2', position, PORT_SNAP_DISTANCE_PX)
    const next = applyComponentSnap(layout, 'belt-2', position, snap, PORT_SNAP_DISTANCE_PX)
    expect(next.components.find((component) => component.id === 'belt-2')?.position).toEqual(position)
    expect(next.connections).toContainEqual({ from: 'belt-1:out', to: 'belt-2:in' })
  })

  it('drops a connection when the component is pulled apart', () => {
    const connected = twoBeltLayout([{ from: 'belt-1:out', to: 'belt-2:in' }])
    const next = applyComponentSnap(connected, 'belt-2', { x: 900, y: 400 }, null, PORT_SNAP_DISTANCE_PX)
    expect(next.connections).toHaveLength(0)
  })

  it('keeps a connection when the seam stays within the snap distance', () => {
    const connected = twoBeltLayout([{ from: 'belt-1:out', to: 'belt-2:in' }])
    const size = componentSizePx(connected.components[0], UNITS)
    // Move belt-2 so its in-port sits ~5 px from belt-1's out-port — still seated.
    const flush = { x: 100 + size.width + 5, y: 100 }
    const next = applyComponentSnap(connected, 'belt-2', flush, null, PORT_SNAP_DISTANCE_PX)
    expect(next.connections).toHaveLength(1)
  })
})

describe('componentsInMarquee', () => {
  it('returns the ids of components whose footprint overlaps the marquee', () => {
    const layout = twoBeltLayout()
    // belt-1 spans x 100..300; belt-2 spans x 400..600. This box covers only belt-1.
    const ids = componentsInMarquee(layout.components, UNITS, { x: 80, y: 80, width: 260, height: 120 })
    expect(ids).toEqual(['belt-1'])
  })

  it('selects several components when the marquee spans them', () => {
    const layout = twoBeltLayout()
    const ids = componentsInMarquee(layout.components, UNITS, { x: 80, y: 80, width: 560, height: 120 })
    expect(ids).toEqual(['belt-1', 'belt-2'])
  })

  it('normalises a marquee dragged up-and-left (negative extents)', () => {
    const layout = twoBeltLayout()
    // Same box as the first case, drawn from its bottom-right corner backwards.
    const ids = componentsInMarquee(layout.components, UNITS, { x: 340, y: 200, width: -260, height: -120 })
    expect(ids).toEqual(['belt-1'])
  })

  it('returns nothing when the marquee misses every component', () => {
    const layout = twoBeltLayout()
    expect(
      componentsInMarquee(layout.components, UNITS, { x: 900, y: 900, width: 60, height: 60 }),
    ).toEqual([])
  })
})

describe('normalizeRect', () => {
  it('flips negative width/height to a positive top-left rect', () => {
    expect(normalizeRect({ x: 340, y: 200, width: -260, height: -120 })).toEqual({
      x: 80,
      y: 80,
      width: 260,
      height: 120,
    })
  })

  it('leaves an already-positive rect unchanged', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 }
    expect(normalizeRect(rect)).toEqual(rect)
  })
})

describe('componentRect', () => {
  it('is the component position plus its pixel size', () => {
    const b = belt('belt-1', 'straight-belt', { x: 100, y: 100 })
    const size = componentSizePx(b, UNITS)
    expect(componentRect(b, UNITS)).toEqual({ x: 100, y: 100, width: size.width, height: size.height })
  })
})

