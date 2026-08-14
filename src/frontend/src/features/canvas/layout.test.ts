import { describe, expect, it } from 'vitest'
import { defaultLayout } from './defaults'
import {
  advance,
  beltWidthPx,
  canConnect,
  componentPorts,
  componentSizePx,
  curveGeometry,
  defaultComponent,
  emptyLayout,
  metersToPx,
  parseLayout,
  portWorldPos,
  pxToMeters,
  resolvePortWorld,
  serializeLayout,
  toComponentKind,
  validateCanvasLayout,
} from './layout'
import type { Bin, CanvasLayout, Component, ComponentKind } from './types'

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

