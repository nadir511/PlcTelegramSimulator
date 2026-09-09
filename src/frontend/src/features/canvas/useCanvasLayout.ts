import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BASE_BELT_SPEED_PX_PER_SEC, SEED_SELECTED_ID, defaultLayout } from './defaults'
import {
  advance,
  applyComponentSnap,
  binOverSensor,
  buildRoute,
  canConnect,
  componentSizePx,
  DEFAULT_TU_ID_LENGTH,
  defaultComponent,
  isSensorKind,
  metersToPx,
  nearestComponentSnap,
  nextBinId,
  nextTuId,
  parseLayout,
  PORT_SNAP_DISTANCE_PX,
  serializeLayout,
} from './layout'
import type { Route, SensorRect } from './layout'
import { createSimulationClient } from './simulationClientFactory'
import type { ArrivalTelegram, SimulationClient } from './simulationClient'
import { encodeArrivalTelegram } from './telegramEncoding'
import { allFields } from '../telegrams/format'
import { DEFAULT_END_OF_TELEGRAM, SEED_TELEGRAM_TYPES } from '../telegrams/defaults'
import { loadStoredTelegrams } from '../telegrams/persistence'
import type { TelegramType } from '../telegrams/types'
import type {
  Bin,
  BinType,
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

/**
 * Flattens the configured pool into a round-robin release sequence — one entry per
 * bin unit — so releasing them in order interleaves the configured colours rather
 * than emptying one type before the next.
 */
function buildReleaseQueue(types: readonly BinType[]): Array<{ typeId: string; color: string }> {
  const remaining = types.map((type) => ({
    typeId: type.typeId,
    color: type.color,
    count: Math.max(0, Math.floor(type.count)),
  }))
  const queue: Array<{ typeId: string; color: string }> = []
  let addedRound = true
  while (addedRound) {
    addedRound = false
    for (const type of remaining) {
      if (type.count > 0) {
        queue.push({ typeId: type.typeId, color: type.color })
        type.count -= 1
        addedRound = true
      }
    }
  }
  return queue
}

/** The inspector-editable subset of a component (drives dirty-tracking + apply). */
function editableSignature(component: Component): string {
  return JSON.stringify({
    label: component.label,
    rotation: component.rotation,
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
  /** The bin source pool (`layout.binSource`) — the configured bin types + counts. */
  binSource: CanvasLayout['binSource']
  /** Total number of bins configured across every pool type (drives the start gate). */
  binCount: number
  /** Bins still held in the source pool (shrinks as bins are released during a run). */
  binsRemaining: number

  /** Id of the selected component, or `null`. */
  selectedId: string | null
  /** The full selection set (one or many) — drives the highlight + delete. */
  selectedIds: ReadonlySet<string>
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
  /** Remove every currently-selected component (marquee / keyboard-delete). */
  removeSelected: () => void
  /** Link two component ports (normalised to `out → in`); ignores invalid pairs. */
  addConnection: (from: string, to: string) => void
  /** Remove the directed link between two ports. */
  removeConnection: (from: string, to: string) => void
  /** Persist a component's new pixel position after a drag. */
  moveComponent: (id: string, position: Vec2) => void
  /** Commit a component drag with magnetic snapping (flush-connect / pull-apart). */
  snapComponent: (id: string, droppedPosition: Vec2) => void
  /** Append a new bin type to the source pool (with sensible defaults). */
  addBinType: () => void
  /** Patch a pool bin type (typeId / colour / count) by index. */
  updateBinType: (index: number, patch: Partial<BinType>) => void
  /** Remove a pool bin type by index. */
  removeBinType: (index: number) => void
  /** Set the Bin Source's distance-between-bins (metres); drives release + gap spacing. */
  updateBinSpacing: (meters: number) => void
  /** Select a placed component (opens the inspector). */
  selectNode: (id: string) => void
  /** Replace the multi-selection with `ids` (e.g. from a rubber-band marquee). */
  selectNodes: (ids: readonly string[]) => void
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
  /** Explicitly persist the current layout to storage; returns whether it was saved. */
  saveLayout: () => boolean
  /** Whether the working layout has edits not yet written by {@link saveLayout}. */
  hasUnsavedChanges: boolean
  /** Replace the layout from a JSON string (validated); clears selection on success. */
  importLayout: (json: string) => ImportResult

  play: () => void
  pause: () => void
  stop: () => void
  setSpeed: (speed: SimSpeed) => void
  /**
   * Emit a single preview bin from the Bin Source (at the belt it feeds); no-op
   * without one. The running simulation releases the configured pool automatically,
   * so this is mainly a programmatic/manual entry point.
   */
  spawnBin: () => void
  /** Advance the preview simulation by `dtMs` (driven by the page's animation loop). */
  tick: (dtMs: number) => void
}

/**
 * The telegram templates an MP arrival is encoded against (ADR-0009): the type
 * registry plus the registry-wide End-of-Telegram terminator. Mirrors the shape
 * {@link loadStoredTelegrams} returns so the hook can default to the persisted
 * templates (or the seeds) without extra plumbing.
 */
export interface TelegramRegistry {
  types: readonly TelegramType[]
  endOfTelegram: string
}

/**
 * Resolves the {@link TelegramType} a sensor emits from the registry: the type whose
 * `code` matches the sensor's `telegramTypeId`, else the first type, else `undefined`
 * (an empty registry). The fallbacks keep a best-effort telegram flowing rather than
 * dropping the arrival when a sensor references a since-removed type.
 */
function resolveTelegramType(
  types: readonly TelegramType[],
  telegramTypeId: string,
): TelegramType | undefined {
  return types.find((type) => type.code === telegramTypeId) ?? types[0]
}

/**
 * The byte width the bin's transport-unit id should fill: the `length` of the telegram
 * field a sensor binds to `bin.tuId` (ADR-0009), so the minted id fills that `TU` slot
 * exactly (no prefix, no padding needed). Scans the layout for the first sensor with
 * such a binding whose bound field resolves; falls back to {@link DEFAULT_TU_ID_LENGTH}
 * when none carries the tuId (e.g. the seed types define no `TU` field). The id is
 * minted at spawn — before a bin is bound to any one sensor — so the first matching
 * sensor's field width wins.
 */
function resolveTuIdLength(
  types: readonly TelegramType[],
  components: readonly Component[],
): number {
  for (const component of components) {
    const sensor = component.sensor
    if (!sensor) continue
    const binding = sensor.fieldBindings.find((candidate) => candidate.source === 'bin.tuId')
    if (!binding) continue
    const type = resolveTelegramType(types, sensor.telegramTypeId)
    if (!type) continue
    const target = binding.field.trim().toLowerCase()
    const field = allFields(type.groups).find(
      (candidate) => candidate.name.trim().toLowerCase() === target,
    )
    if (field && Number.isInteger(field.length) && field.length > 0) return field.length
  }
  return DEFAULT_TU_ID_LENGTH
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
 * bin simply holds at the MP (awaiting a transport order that never comes) rather
 * than moving on — the passive client never fabricates a release.
 */
export function useCanvasLayout(
  seed?: CanvasLayout,
  injectedClient?: SimulationClient,
  getTelegramRegistry?: () => TelegramRegistry,
): UseCanvasLayoutResult {
  const client = useMemo(() => injectedClient ?? createSimulationClient(), [injectedClient])
  /**
   * The telegram templates arrivals are encoded against. Defaults to the persisted
   * registry (or the seeds when none is stored); tests inject a stub for hermeticism.
   * Memoised on the resolver so it's read once per run rather than on every arrival.
   */
  const telegramRegistry = useMemo<TelegramRegistry>(() => {
    if (getTelegramRegistry) return getTelegramRegistry()
    const stored = loadStoredTelegrams()
    return stored ?? { types: SEED_TELEGRAM_TYPES, endOfTelegram: DEFAULT_END_OF_TELEGRAM }
  }, [getTelegramRegistry])
  const [layout, setLayout] = useState<CanvasLayout>(() => loadInitialLayout(seed))
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelectedId(layout))
  const [draft, setDraft] = useState<Component | null>(() => {
    const initial = layout.components.find((component) => component.id === initialSelectedId(layout))
    return initial ? cloneComponent(initial) : null
  })
  /**
   * The full selection set (one or many). A rubber-band marquee can select several
   * components at once; this drives the on-canvas highlight and the delete action.
   * `selectedId` remains the single inspector target (the sole member, or null).
   */
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => {
    const initial = initialSelectedId(layout)
    return initial ? new Set([initial]) : new Set()
  })
  /**
   * The layout as last persisted, serialised. Layout edits (add / delete / move /
   * property apply) update the working `layout` and render live, but are NOT
   * auto-persisted — they only commit to storage on an explicit {@link saveLayout}.
   * Comparing the working layout to this snapshot yields {@link hasUnsavedChanges},
   * which blinks the toolbar's Save button until the user saves.
   */
  const [savedSignature, setSavedSignature] = useState<string>(() => serializeLayout(layout))
  const [bins, setBins] = useState<Bin[]>([])
  const [triggered, setTriggered] = useState<Set<string>>(() => new Set())
  const [awaitingTo, setAwaitingTo] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<SimStatus>('idle')
  const [speed, setSpeedState] = useState<SimSpeed>(1)
  /** Bins released from the pool so far this run — drives the source's shrinking count. */
  const [poolReleased, setPoolReleased] = useState(0)
  /** Monotonic counter that cascades added-component positions and seeds ids. */
  const addCountRef = useRef(0)
  /** Transport-unit ids awaiting a TO; read synchronously by the motion step. */
  const blockedRef = useRef<Set<string>>(new Set())
  /** `tuId::sensorId` keys already reported, so each arrival fires exactly once. */
  const reportedRef = useRef<Set<string>>(new Set())
  /**
   * Monotonic correlation-id source (ADR-0009): the frontend mints the `TelegramId`
   * for each new blocked arrival, encodes it into the telegram, and the backend
   * relays + correlates on it. Reset to 0 on stop/import so a fresh run restarts at 1.
   */
  const telegramIdRef = useRef(0)
  /** Latest bins, mirrored so the animation step can read them without stale closures. */
  const binsRef = useRef<readonly Bin[]>(bins)
  binsRef.current = bins
  /** Latest layout, mirrored so drag-snap can read committed geometry synchronously. */
  const layoutRef = useRef<CanvasLayout>(layout)
  layoutRef.current = layout
  /** Latest selection, mirrored so the keyboard-delete handler avoids stale closures. */
  const selectedIdsRef = useRef<ReadonlySet<string>>(selectedIds)
  selectedIdsRef.current = selectedIds
  /**
   * The bins still to be released from the pool this run, one per remaining unit.
   * Built on the idle → running transition ({@link play}) and drained by {@link tick}
   * as the source entry clears; cleared on {@link stop}.
   */
  const releaseQueueRef = useRef<Array<{ typeId: string; color: string }>>([])
  /**
   * Width (chars) of a newly minted transport-unit id: the length of the telegram
   * field bound to `bin.tuId`, so the id fills that `TU` slot exactly (ADR-0009).
   * Mirrored to a ref so {@link spawnBin}/{@link tick} read it without widening their
   * dependency arrays (and re-creating the animation callback every render).
   */
  const tuIdLength = useMemo(
    () => resolveTuIdLength(telegramRegistry.types, layout.components),
    [telegramRegistry.types, layout.components],
  )
  const tuIdLengthRef = useRef(tuIdLength)
  tuIdLengthRef.current = tuIdLength

  // Layout edits render live but are NOT auto-persisted — they commit to storage
  // only on an explicit save (see saveLayout). `hasUnsavedChanges` compares the
  // working layout to the last-saved snapshot so the toolbar can blink until save.
  const hasUnsavedChanges = useMemo(
    () => serializeLayout(layout) !== savedSignature,
    [layout, savedSignature],
  )

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

  /** Sink rects: a preview bin reaching one is removed (it has reached its destination). */
  const sinkRects = useMemo<SensorRect[]>(() => {
    return layout.components
      .filter((component) => component.kind === 'sink')
      .map((component) => {
        const size = componentSizePx(component, layout.units)
        return {
          id: component.id,
          x: component.position.x,
          y: component.position.y,
          width: size.width,
          height: size.height,
        }
      })
  }, [layout.components, layout.units])

  /**
   * Minimum bin spacing in px: the Bin Source's configured distance-between-bins
   * (falling back to the global control-logic default) plus the on-canvas footprint.
   * Drives both the release cadence and the in-transit gap enforced by {@link advance}.
   */
  const minGapPx = useMemo(() => {
    const spacingMeters = layout.binSource.spacingMeters ?? layout.controlLogic.minBinDistanceMeters
    return metersToPx(spacingMeters, layout.units) + BIN_DIAMETER_PX
  }, [layout.binSource.spacingMeters, layout.controlLogic.minBinDistanceMeters, layout.units])

  /**
   * The conveyor path bins ride: the belt centrelines from the Bin Source's out port
   * through each connected transport component. `null` when no source feeds a belt, in
   * which case bins fall back to the plain +x preview.
   */
  const route = useMemo<Route | null>(() => buildRoute(layout), [layout])

  /**
   * Where a released bin enters the line: the start of the conveyor route (so it lands
   * on the belt fed by the Bin Source), or the source's own right edge as a fallback
   * when nothing is connected. `null` when there is no Bin Source to release from.
   */
  const spawnPoint = useMemo<Vec2 | null>(() => {
    if (route) return route.points[0]

    const source = layout.components.find((component) => component.kind === 'bin-source')
    if (!source) return null

    const size = componentSizePx(source, layout.units)
    return { x: source.position.x + size.width, y: source.position.y + size.height / 2 }
  }, [route, layout.components, layout.units])

  /** Total bins configured across every pool type — gates the start button. */
  const binCount = useMemo(
    () => layout.binSource.types.reduce((sum, type) => sum + Math.max(0, Math.floor(type.count)), 0),
    [layout.binSource.types],
  )

  /** Bins still waiting in the source pool (total configured minus those released). */
  const binsRemaining = Math.max(0, binCount - poolReleased)

  /** Releases a bin awaiting its TO so it — and its queue — resume. */
  const release = useCallback((transportUnitId: string) => {
    if (!blockedRef.current.has(transportUnitId)) return
    blockedRef.current.delete(transportUnitId)
    setAwaitingTo(new Set(blockedRef.current))
  }, [])

  /**
   * Immutably patch the bin whose `tuId` matches (a no-op if none is present), so
   * correlation fields (telegram id, destination MP, timed-out flag) can be stamped
   * onto a bin without disturbing its motion/queueing. Bins are cleared on stop/import,
   * which discards these fields with them.
   */
  const patchBin = useCallback((transportUnitId: string, patch: (bin: Bin) => Bin) => {
    setBins((current) => {
      let changed = false
      const next = current.map((bin) => {
        if (bin.tuId !== transportUnitId) return bin
        changed = true
        return patch(bin)
      })
      return changed ? next : current
    })
  }, [])

  // The authoritative reply drives the held bin (ADR-0012). Only a transport order
  // releases it — it carries the routed next MP (`destinationMp`); a fault is a
  // non-releasing signal that marks the bin timed-out so it keeps holding at the MP
  // rather than moving on. An `mpReported` echo stamps the bin's telegram id.
  useEffect(() => {
    return client.subscribe((event) => {
      if (event.type === 'mpReported') {
        const { transportUnitId, telegramId } = event.report
        patchBin(transportUnitId, (bin) => ({ ...bin, telegramId }))
      } else if (event.type === 'transportOrder') {
        const { transportUnitId, destinationMp } = event.order
        patchBin(transportUnitId, (bin) => ({ ...bin, destinationMp, timedOut: false }))
        release(transportUnitId)
      } else if (event.type === 'fault') {
        patchBin(event.fault.transportUnitId, (bin) => ({ ...bin, timedOut: true }))
      }
    })
  }, [client, release, patchBin])

  // A bin entering an MP sensor is reported once and blocks until its TO arrives.
  // The arrival carries a frontend-minted correlation id and the sensor's complete
  // encoded telegram (ADR-0009): the backend relays those bytes verbatim (the id is
  // already encoded in) and correlates on the id. When the telegram can't be
  // finalised frontend-side its payload is omitted and the backend falls back to its
  // interim MP codec — still keyed by the same id. Encoding never affects block/release.
  useEffect(() => {
    if (bins.length === 0) return
    const reports: Array<{ tuId: string; mpId: string; telegram: ArrivalTelegram }> = []
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
          // Mint the correlation id for this arrival up-front so it is encoded into
          // the telegram and also sent as the scalar the backend correlates on.
          const telegramId = (telegramIdRef.current += 1)
          // `mpSensorRects` only carries {id, mpId}; the SensorProps (telegram type +
          // field bindings) live on the layout component. Anything missing or a
          // non-finalisable telegram yields no payload -> interim backend fallback.
          const sensorProps = layout.components.find((component) => component.id === sensor.id)
            ?.sensor
          const type = sensorProps
            ? resolveTelegramType(telegramRegistry.types, sensorProps.telegramTypeId)
            : undefined
          const payload =
            sensorProps && type
              ? encodeArrivalTelegram(type, sensorProps, bin, telegramId)
              : null
          reports.push({ tuId: bin.tuId, mpId, telegram: { telegramId, payload: payload ?? undefined } })
        }
      }
    }
    if (reports.length === 0) return
    setAwaitingTo(new Set(blockedRef.current))
    for (const report of reports) {
      void client.reportArrival(report.tuId, report.mpId, report.telegram)
    }
  }, [bins, mpSensorRects, client, layout.components, telegramRegistry])

  const selectNode = useCallback(
    (id: string) => {
      const target = layout.components.find((component) => component.id === id)
      if (!target) return
      setSelectedId(id)
      setSelectedIds(new Set([id]))
      setDraft(cloneComponent(target))
    },
    [layout.components],
  )

  /**
   * Replace the multi-selection with `ids` (e.g. from a rubber-band marquee). When
   * exactly one component is selected it also becomes the inspector target; a
   * multi-selection clears the single inspector (delete still works on the set).
   */
  const selectNodes = useCallback((ids: readonly string[]) => {
    const known = ids.filter((id) => layoutRef.current.components.some((c) => c.id === id))
    setSelectedIds(new Set(known))
    if (known.length === 1) {
      const target = layoutRef.current.components.find((c) => c.id === known[0]) ?? null
      setSelectedId(target ? known[0] : null)
      setDraft(target ? cloneComponent(target) : null)
    } else {
      setSelectedId(null)
      setDraft(null)
    }
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setSelectedIds(new Set())
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
      setSelectedIds(new Set([created.id]))
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
    setSelectedIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setDraft((current) => (current && current.id === id ? null : current))
  }, [])

  /**
   * Remove every currently-selected component (the marquee/keyboard-delete path),
   * pruning their connections and area memberships, then clear the selection. Reads
   * the selection from a ref so the keyboard handler never captures a stale set.
   */
  const removeSelected = useCallback(() => {
    const ids = selectedIdsRef.current
    if (ids.size === 0) return
    setLayout((current) => {
      const removed = new Set([...ids].filter((id) => current.components.some((c) => c.id === id)))
      if (removed.size === 0) return current
      const removedPortIds = new Set<string>()
      const removedMpIds = new Set<string>()
      for (const component of current.components) {
        if (!removed.has(component.id)) continue
        for (const port of component.ports) removedPortIds.add(port.id)
        if (component.sensor?.mpId) removedMpIds.add(component.sensor.mpId)
      }
      return {
        ...current,
        components: current.components.filter((component) => !removed.has(component.id)),
        connections: current.connections.filter(
          (connection) => !removedPortIds.has(connection.from) && !removedPortIds.has(connection.to),
        ),
        areas: current.areas.map((area) => ({
          ...area,
          memberComponentIds: area.memberComponentIds.filter((member) => !removed.has(member)),
          mpSensorIds: area.mpSensorIds.filter((sensorId) => !removedMpIds.has(sensorId)),
        })),
      }
    })
    setSelectedId(null)
    setSelectedIds(new Set())
    setDraft(null)
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

  /**
   * Commits a component drag under the magnet model: snaps the piece flush to a
   * neighbouring port when one is within {@link PORT_SNAP_DISTANCE_PX} (creating
   * the connection), otherwise drops it where released — and, either way,
   * disconnects any of this component's links that were pulled apart.
   */
  const snapComponent = useCallback((id: string, droppedPosition: Vec2) => {
    const source = layoutRef.current
    const snap = nearestComponentSnap(
      source.components,
      source.units,
      id,
      droppedPosition,
      PORT_SNAP_DISTANCE_PX,
    )
    const position = snap ? snap.position : droppedPosition
    setLayout((current) => applyComponentSnap(current, id, position, snap, PORT_SNAP_DISTANCE_PX))
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

  /** Picks a unique default `typeId` (BIN, BIN-2, …) for a newly added pool type. */
  const nextBinTypeId = (types: readonly BinType[]): string => {
    const existing = new Set(types.map((type) => type.typeId))
    if (!existing.has('BIN')) return 'BIN'
    let suffix = 2
    while (existing.has(`BIN-${suffix}`)) suffix += 1
    return `BIN-${suffix}`
  }

  const addBinType = useCallback(() => {
    setLayout((current) => ({
      ...current,
      binSource: {
        ...current.binSource,
        types: [
          ...current.binSource.types,
          { typeId: nextBinTypeId(current.binSource.types), color: '#3b82f6', count: 1 },
        ],
      },
    }))
  }, [])

  const updateBinType = useCallback((index: number, patch: Partial<BinType>) => {
    setLayout((current) => ({
      ...current,
      binSource: {
        ...current.binSource,
        types: current.binSource.types.map((type, current2) =>
          current2 === index ? { ...type, ...patch } : type,
        ),
      },
    }))
  }, [])

  const removeBinType = useCallback((index: number) => {
    setLayout((current) => ({
      ...current,
      binSource: {
        ...current.binSource,
        types: current.binSource.types.filter((_, current2) => current2 !== index),
      },
    }))
  }, [])

  const updateBinSpacing = useCallback((meters: number) => {
    setLayout((current) => ({
      ...current,
      binSource: { ...current.binSource, spacingMeters: Math.max(0, meters) },
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
              rotation: committed.rotation,
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

  // The explicit, user-driven save: this is the ONLY place layout edits are written
  // to storage. On success it also resets the unsaved-changes baseline so the Save
  // button stops blinking until the next edit.
  const saveLayout = useCallback((): boolean => {
    const serialized = serializeLayout(layout)
    try {
      if (typeof localStorage === 'undefined') return false
      localStorage.setItem(STORAGE_KEY, serialized)
      setSavedSignature(serialized)
      return true
    } catch {
      return false
    }
  }, [layout])

  const importLayout = useCallback((json: string): ImportResult => {
    const result = parseLayout(json)
    if (!result.ok) return { ok: false, errors: result.errors }
    setLayout(result.layout)
    setSelectedId(null)
    setSelectedIds(new Set())
    setDraft(null)
    setBins([])
    setTriggered(new Set())
    blockedRef.current = new Set()
    reportedRef.current = new Set()
    telegramIdRef.current = 0
    setAwaitingTo(new Set())
    setPoolReleased(0)
    setStatus('idle')
    // A fresh baseline also clears any per-run client correlation state (e.g. the demo
    // telegram-id sequence), mirroring stop() so the imported layout starts clean.
    client.reset?.()
    // An import loads a fresh baseline: persist it and reset the unsaved-changes
    // snapshot so the freshly-loaded layout isn't immediately flagged as dirty.
    const serialized = serializeLayout(result.layout)
    setSavedSignature(serialized)
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, serialized)
    } catch {
      // Best-effort persistence; ignore unavailable storage.
    }
    return { ok: true, errors: result.errors }
  }, [client])

  const play = useCallback(() => {
    // A fresh start (from idle) loads the configured pool into the release queue and
    // resets the released tally; resuming from paused keeps both so bins aren't re-released.
    if (status === 'idle') {
      releaseQueueRef.current = buildReleaseQueue(layout.binSource.types)
      setPoolReleased(0)
    }
    setStatus('running')
  }, [status, layout.binSource.types])
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
    telegramIdRef.current = 0
    releaseQueueRef.current = []
    setPoolReleased(0)
    setAwaitingTo(new Set())
    // Reset any per-run client correlation state (e.g. the demo telegram-id sequence)
    // so the next run restarts at #000001. Live/disconnected clients have none.
    client.reset?.()
  }, [client])
  const setSpeed = useCallback((next: SimSpeed) => setSpeedState(next), [])

  const spawnBin = useCallback(() => {
    // Bins originate only from a Bin Source — no source (spawn point), no spawn.
    if (!spawnPoint) return
    const types = layout.binSource.types
    const pick = types.length > 0 ? types[Math.floor(Math.random() * types.length)] : null
    const bin: Bin = {
      id: nextBinId(),
      tuId: nextTuId(tuIdLengthRef.current),
      typeId: pick?.typeId ?? 'BIN',
      color: pick?.color ?? '#5aa9ff',
      x: spawnPoint.x,
      y: spawnPoint.y,
      dist: 0,
    }
    setBins((existing) => [...existing, bin])
  }, [spawnPoint, layout.binSource.types])

  const tick = useCallback(
    (dtMs: number) => {
      // Auto-release from the pool: emit the next configured unit once the source
      // entry is clear, so bins stay spaced and back-pressure at a message point
      // naturally throttles the release (a queue backing up to the source pauses it).
      let released: Bin | null = null
      if (spawnPoint && releaseQueueRef.current.length > 0) {
        const clear = !binsRef.current.some(
          (bin) => Math.hypot(bin.x - spawnPoint.x, bin.y - spawnPoint.y) < minGapPx,
        )
        if (clear) {
          const [next, ...rest] = releaseQueueRef.current
          releaseQueueRef.current = rest
          setPoolReleased((count) => count + 1)
          released = {
            id: nextBinId(),
            tuId: nextTuId(tuIdLengthRef.current),
            typeId: next.typeId,
            color: next.color,
            x: spawnPoint.x,
            y: spawnPoint.y,
            dist: 0,
          }
        }
      }

      setBins((current) => {
        const withReleased = released ? [...current, released] : current
        if (withReleased.length === 0) {
          setTriggered((prev) => (prev.size === 0 ? prev : new Set()))
          return current
        }
        const result = advance({
          bins: withReleased,
          sensors: sensorRects,
          dtMs,
          speed,
          maxX: SIM_MAX_X,
          baseSpeedPxPerSec: BASE_BELT_SPEED_PX_PER_SEC,
          blocked: blockedRef.current,
          minGapPx,
          sinks: sinkRects,
          route,
        })
        setTriggered(result.triggered)
        return result.bins
      })
    },
    [spawnPoint, sensorRects, speed, minGapPx, sinkRects, route],
  )

  return {
    layout,
    components: layout.components,
    connections: layout.connections,
    units: layout.units,
    binSource: layout.binSource,
    binCount,
    binsRemaining,
    selectedId,
    selectedIds,
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
    removeSelected,
    addConnection,
    removeConnection,
    moveComponent,
    snapComponent,
    addBinType,
    updateBinType,
    removeBinType,
    updateBinSpacing,
    selectNode,
    selectNodes,
    clearSelection,
    updateDraft,
    applyDraft,
    revertDraft,
    exportLayout,
    saveLayout,
    hasUnsavedChanges,
    importLayout,
    play,
    pause,
    stop,
    setSpeed,
    spawnBin,
    tick,
  }
}
