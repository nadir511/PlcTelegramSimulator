import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BASE_BELT_SPEED_PX_PER_SEC, SEED_SELECTED_ID, defaultLayout } from './defaults'
import {
  advance,
  binOverSensor,
  canConnect,
  componentSizePx,
  defaultComponent,
  isSensorKind,
  isTransportKind,
  metersToPx,
  nextBinId,
  nextTuId,
  parseLayout,
  serializeLayout,
} from './layout'
import type { SensorRect } from './layout'
import { createSimulationClient } from './simulationClientFactory'
import type { SimulationClient } from './simulationClient'
import type {
  Bin,
  CanvasLayout,
  Component,
  ComponentKind,
  Connection,
  SimSpeed,
  SimStatus,
  Vec2,
} from './types'

/** `localStorage` key the layout section persists under (its own versioned blob). */
export const STORAGE_KEY = 'plc.canvas.layout.v1'

/** Where the next added component lands, cascading so successive adds don't overlap. */
const ADD_ORIGIN = { x: 180, y: 340 }
const ADD_STEP = 28

/** Right edge (px) past which a preview bin leaves the stage and is removed. */
const SIM_MAX_X = 2000

/** On-canvas bin footprint (px); folded into the queue gap so bins never overlap. */
const BIN_DIAMETER_PX = 16

/** Deep-clones a component (pure JSON data) so drafts never alias saved state. */
function cloneComponent(component: Component): Component {
  return JSON.parse(JSON.stringify(component)) as Component
}

/** The inspector-editable subset of a component (drives dirty-tracking + apply). */
function editableSignature(component: Component): string {
  return JSON.stringify({
    label: component.label,
    geometry: component.geometry,
    transport: component.transport,
    sensor: component.sensor,
  })
}

/** Loads the initial layout: an injected seed, else a valid stored layout, else the default. */
function loadInitialLayout(seed?: CanvasLayout): CanvasLayout {
  if (seed) return seed
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const result = parseLayout(raw)
        if (result.ok) return result.layout
      }
    }
  } catch {
    // Ignore unavailable/corrupt storage — fall back to the default layout.
  }
  return defaultLayout()
}

/** Picks the component selected on first load: the seeded MP sensor, else the first. */
function initialSelectedId(layout: CanvasLayout): string | null {
  const seeded = layout.components.find((component) => component.id === SEED_SELECTED_ID)
  return seeded?.id ?? layout.components[0]?.id ?? null
}

/** The result of importing a layout JSON string. */
export interface ImportResult {
  ok: boolean
  errors?: string[]
}

export interface UseCanvasLayoutResult {
  /** The whole persisted layout. */
  layout: CanvasLayout
  /** All placed components (`layout.components`). */
  components: readonly Component[]
  /** The directed port-to-port links (`layout.connections`). */
  connections: readonly Connection[]
  /** The canvas scale (`layout.units`). */
  units: CanvasLayout['units']

  /** Id of the selected component, or `null`. */
  selectedId: string | null
  /** The selected component, or `null`. */
  selectedComponent: Component | null
  /** Editable copy of the selected component, or `null` when nothing is selected. */
  draft: Component | null
  /** Whether the draft's editable fields differ from the saved component. */
  isDirty: boolean

  /** Transient preview bins on the belts (NOT persisted). */
  bins: readonly Bin[]
  /** Ids of sensors a bin is currently over (drives the trigger glow). */
  triggered: ReadonlySet<string>
  /** Transport-unit ids of bins currently awaiting a transport order (ADR-0012). */
  awaitingTo: ReadonlySet<string>
  status: SimStatus
  speed: SimSpeed

  /**
   * Add a component of `kind` and select it. With `position` (a canvas-pixel drop
   * point) the component is centred there; without it, adds cascade from a corner.
   */
  addComponent: (kind: ComponentKind, position?: Vec2) => void
  /** Remove a component (and its connections / area references) from the layout. */
  removeComponent: (id: string) => void
  /** Link two component ports (normalised to `out → in`); ignores invalid pairs. */
  addConnection: (from: string, to: string) => void
  /** Remove the directed link between two ports. */
  removeConnection: (from: string, to: string) => void
  /** Persist a component's new pixel position after a drag. */
  moveComponent: (id: string, position: Vec2) => void
  /** Select a placed component (opens the inspector). */
  selectNode: (id: string) => void
  /** Clear the selection (closes the inspector). */
  clearSelection: () => void
  /** Patch the inspector draft for the selected component. */
  updateDraft: (patch: Partial<Component>) => void
  /** Commit the draft's editable fields back onto the selected component. */
  applyDraft: () => void
  /** Reload the draft from the saved component, discarding edits. */
  revertDraft: () => void

  /** Serialise the current layout to pretty JSON. */
  exportLayout: () => string
  /** Replace the layout from a JSON string (validated); clears selection on success. */
  importLayout: (json: string) => ImportResult

  play: () => void
  pause: () => void
  stop: () => void
  setSpeed: (speed: SimSpeed) => void
  /** Spawn a preview bin at the start of the first belt / bin source. */
  spawnBin: () => void
  /** Advance the preview simulation by `dtMs` (driven by the page's animation loop). */
  tick: (dtMs: number) => void
}

/**
 * Owns the {@link CanvasLayout}, selection + inspector draft, layout persistence
 * (`localStorage` + export/import), and a transient preview simulation clock.
 *
 * The layout is the design-time contract (ADR-0013); the preview motion here is a
 * local convenience. When a bin reaches an MP sensor it reports the arrival to the
 * backend through the injected {@link SimulationClient} and blocks (queuing the
 * bins behind it) until the matching transport order arrives — the MP→TO
 * round-trip is backend-authoritative (ADR-0012). With no backend configured the
 * mock client replays the round-trip locally so the canvas stays interactive.
 */
export function useCanvasLayout(
  seed?: CanvasLayout,
  injectedClient?: SimulationClient,
): UseCanvasLayoutResult {
  const client = useMemo(() => injectedClient ?? createSimulationClient(), [injectedClient])
  const [layout, setLayout] = useState<CanvasLayout>(() => loadInitialLayout(seed))
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelectedId(layout))
  const [draft, setDraft] = useState<Component | null>(() => {
    const initial = layout.components.find((component) => component.id === initialSelectedId(layout))
    return initial ? cloneComponent(initial) : null
  })
  const [bins, setBins] = useState<Bin[]>([])
  const [triggered, setTriggered] = useState<Set<string>>(() => new Set())
  const [awaitingTo, setAwaitingTo] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<SimStatus>('idle')
  const [speed, setSpeedState] = useState<SimSpeed>(1)
  /** Monotonic counter that cascades added-component positions and seeds ids. */
  const addCountRef = useRef(0)
  /** Transport-unit ids awaiting a TO; read synchronously by the motion step. */
  const blockedRef = useRef<Set<string>>(new Set())
  /** `tuId::sensorId` keys already reported, so each arrival fires exactly once. */
  const reportedRef = useRef<Set<string>>(new Set())

  // Persist the layout section whenever it changes (safe against unavailable storage).
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, serializeLayout(layout))
      }
    } catch {
      // Ignore quota/SSR/private-mode failures — persistence is best-effort.
    }
  }, [layout])

  const selectedComponent = useMemo(
    () => layout.components.find((component) => component.id === selectedId) ?? null,
    [layout.components, selectedId],
  )

  const isDirty = useMemo(() => {
    if (!draft || !selectedComponent) return false
    return editableSignature(draft) !== editableSignature(selectedComponent)
  }, [draft, selectedComponent])

  /** Sensor pixel rects, recomputed only when components/units change. */
  const sensorRects = useMemo<SensorRect[]>(() => {
    return layout.components
      .filter((component) => isSensorKind(component.kind))
      .map((component) => {
        const size = componentSizePx(component, layout.units)
        return {
          id: component.id,
          mpId: component.sensor?.mpId,
          x: component.position.x,
          y: component.position.y,
          width: size.width,
          height: size.height,
        }
      })
  }, [layout.components, layout.units])

  /** MP-sensor rects (kind `mp-sensor` with an id): the backend reporting points. */
  const mpSensorRects = useMemo<SensorRect[]>(() => {
    return layout.components
      .filter((component) => component.kind === 'mp-sensor' && Boolean(component.sensor?.mpId))
      .map((component) => {
        const size = componentSizePx(component, layout.units)
        return {
          id: component.id,
          mpId: component.sensor?.mpId,
          x: component.position.x,
          y: component.position.y,
          width: size.width,
          height: size.height,
        }
      })
  }, [layout.components, layout.units])

  /** Minimum bin spacing in px: the configured distance plus the on-canvas footprint. */
  const minGapPx = useMemo(
    () => metersToPx(layout.controlLogic.minBinDistanceMeters, layout.units) + BIN_DIAMETER_PX,
    [layout.controlLogic.minBinDistanceMeters, layout.units],
  )

  /** Releases a bin awaiting its TO (or faulted) so it — and its queue — resume. */
  const release = useCallback((transportUnitId: string) => {
    if (!blockedRef.current.has(transportUnitId)) return
    blockedRef.current.delete(transportUnitId)
    setAwaitingTo(new Set(blockedRef.current))
  }, [])

  // The authoritative reply: a transport order (or a fault) releases the waiting bin.
  useEffect(() => {
    return client.subscribe((event) => {
      if (event.type === 'transportOrder') release(event.order.transportUnitId)
      else if (event.type === 'fault') release(event.fault.transportUnitId)
    })
  }, [client, release])

  // A bin entering an MP sensor is reported once and blocks until its TO arrives.
  useEffect(() => {
    if (bins.length === 0) return
    const reports: Array<{ tuId: string; mpId: string }> = []
    for (const sensor of mpSensorRects) {
      const mpId = sensor.mpId
      if (!mpId) continue
      for (const bin of bins) {
        if (!binOverSensor(bin, sensor)) continue
        const key = `${bin.tuId}::${sensor.id}`
        if (reportedRef.current.has(key)) continue
        reportedRef.current.add(key)
        if (!blockedRef.current.has(bin.tuId)) {
          blockedRef.current.add(bin.tuId)
          reports.push({ tuId: bin.tuId, mpId })
        }
      }
    }
    if (reports.length === 0) return
    setAwaitingTo(new Set(blockedRef.current))
    for (const report of reports) void client.reportArrival(report.tuId, report.mpId)
  }, [bins, mpSensorRects, client])

  const selectNode = useCallback(
    (id: string) => {
      const target = layout.components.find((component) => component.id === id)
      if (!target) return
      setSelectedId(id)
      setDraft(cloneComponent(target))
    },
    [layout.components],
  )

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setDraft(null)
  }, [])

  const addComponent = useCallback(
    (kind: ComponentKind, position?: Vec2) => {
      const count = addCountRef.current
      addCountRef.current = count + 1
      const created = defaultComponent(kind, count + 1)
      if (position) {
        // Centre the new component on the drop point.
        const size = componentSizePx(created, layout.units)
        created.position = { x: position.x - size.width / 2, y: position.y - size.height / 2 }
      } else {
        created.position = { x: ADD_ORIGIN.x + count * ADD_STEP, y: ADD_ORIGIN.y + count * ADD_STEP }
      }
      setLayout((current) => ({ ...current, components: [...current.components, created] }))
      setSelectedId(created.id)
      setDraft(cloneComponent(created))
    },
    [layout.units],
  )

  const removeComponent = useCallback((id: string) => {
    setLayout((current) => {
      const target = current.components.find((component) => component.id === id)
      if (!target) return current
      const portIds = new Set(target.ports.map((port) => port.id))
      const mpId = target.sensor?.mpId
      return {
        ...current,
        components: current.components.filter((component) => component.id !== id),
        connections: current.connections.filter(
          (connection) => !portIds.has(connection.from) && !portIds.has(connection.to),
        ),
        areas: current.areas.map((area) => ({
          ...area,
          memberComponentIds: area.memberComponentIds.filter((member) => member !== id),
          mpSensorIds: mpId
            ? area.mpSensorIds.filter((sensorId) => sensorId !== mpId)
            : area.mpSensorIds,
        })),
      }
    })
    setSelectedId((current) => (current === id ? null : current))
    setDraft((current) => (current && current.id === id ? null : current))
  }, [])

  const moveComponent = useCallback((id: string, position: Vec2) => {
    setLayout((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === id ? { ...component, position } : component,
      ),
    }))
    setDraft((current) => (current && current.id === id ? { ...current, position } : current))
  }, [])

  const addConnection = useCallback((from: string, to: string) => {
    setLayout((current) => {
      const result = canConnect(current, from, to)
      if (!result.ok || !result.connection) return current
      return { ...current, connections: [...current.connections, result.connection] }
    })
  }, [])

  const removeConnection = useCallback((from: string, to: string) => {
    setLayout((current) => ({
      ...current,
      connections: current.connections.filter(
        (connection) => !(connection.from === from && connection.to === to),
      ),
    }))
  }, [])

  const updateDraft = useCallback((patch: Partial<Component>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const applyDraft = useCallback(() => {
    if (!draft || !selectedId) return
    const committed = cloneComponent(draft)
    setLayout((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === selectedId
          ? {
              ...component,
              label: committed.label,
              geometry: committed.geometry,
              transport: committed.transport,
              sensor: committed.sensor,
            }
          : component,
      ),
    }))
  }, [draft, selectedId])

  const revertDraft = useCallback(() => {
    if (selectedComponent) setDraft(cloneComponent(selectedComponent))
  }, [selectedComponent])

  const exportLayout = useCallback(() => serializeLayout(layout), [layout])

  const importLayout = useCallback((json: string): ImportResult => {
    const result = parseLayout(json)
    if (!result.ok) return { ok: false, errors: result.errors }
    setLayout(result.layout)
    setSelectedId(null)
    setDraft(null)
    setBins([])
    setTriggered(new Set())
    blockedRef.current = new Set()
    reportedRef.current = new Set()
    setAwaitingTo(new Set())
    setStatus('idle')
    return { ok: true, errors: result.errors }
  }, [])

  const play = useCallback(() => setStatus('running'), [])
  const pause = useCallback(
    () => setStatus((current) => (current === 'running' ? 'paused' : current)),
    [],
  )
  const stop = useCallback(() => {
    setStatus('idle')
    setBins([])
    setTriggered(new Set())
    blockedRef.current = new Set()
    reportedRef.current = new Set()
    setAwaitingTo(new Set())
  }, [])
  const setSpeed = useCallback((next: SimSpeed) => setSpeedState(next), [])

  const spawnBin = useCallback(() => {
    const belt = layout.components.find((component) => isTransportKind(component.kind))
    const source = layout.components.find((component) => component.kind === 'bin-source')
    let x = 80
    let y = 240
    if (belt) {
      const size = componentSizePx(belt, layout.units)
      x = belt.position.x + 8
      y = belt.position.y + size.height / 2
    } else if (source) {
      const size = componentSizePx(source, layout.units)
      x = source.position.x + size.width
      y = source.position.y + size.height / 2
    }

    const types = layout.binSource.types
    const pick = types.length > 0 ? types[Math.floor(Math.random() * types.length)] : null
    const bin: Bin = {
      id: nextBinId(),
      tuId: nextTuId(),
      typeId: pick?.typeId ?? 'BIN',
      color: pick?.color ?? '#5aa9ff',
      x,
      y,
    }
    setBins((existing) => [...existing, bin])
  }, [layout])

  const tick = useCallback(
    (dtMs: number) => {
      setBins((current) => {
        if (current.length === 0) {
          setTriggered((prev) => (prev.size === 0 ? prev : new Set()))
          return current
        }
        const result = advance({
          bins: current,
          sensors: sensorRects,
          dtMs,
          speed,
          maxX: SIM_MAX_X,
          baseSpeedPxPerSec: BASE_BELT_SPEED_PX_PER_SEC,
          blocked: blockedRef.current,
          minGapPx,
        })
        setTriggered(result.triggered)
        return result.bins
      })
    },
    [sensorRects, speed, minGapPx],
  )

  return {
    layout,
    components: layout.components,
    connections: layout.connections,
    units: layout.units,
    selectedId,
    selectedComponent,
    draft,
    isDirty,
    bins,
    triggered,
    awaitingTo,
    status,
    speed,
    addComponent,
    removeComponent,
    addConnection,
    removeConnection,
    moveComponent,
    selectNode,
    clearSelection,
    updateDraft,
    applyDraft,
    revertDraft,
    exportLayout,
    importLayout,
    play,
    pause,
    stop,
    setSpeed,
    spawnBin,
    tick,
  }
}
