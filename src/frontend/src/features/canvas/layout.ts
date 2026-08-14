/**
 * Pure, framework-free helpers for the {@link CanvasLayout} model (ADR-0013):
 * unit conversion, kind predicates, component defaults, defensive validation,
 * (de)serialisation, id generation, and the transient preview-motion step.
 *
 * No Konva or React imports live here so every function is unit-testable in
 * isolation. Runtime bin motion (`advance`) is a *design-time preview* only — the
 * authoritative simulation is backend-owned (ADR-0012).
 */
import type {
  Area,
  Bin,
  BinSource,
  BinType,
  CanvasLayout,
  Component,
  ComponentKind,
  Connection,
  ControlLogic,
  ConveyorState,
  Direction,
  FieldBinding,
  FieldBindingSource,
  Geometry,
  Port,
  PortRole,
  SensorProps,
  SimSpeed,
  TransportProps,
  Units,
  Vec2,
} from './types'
import { CANVAS_SCHEMA_VERSION } from './types'

// ---------------------------------------------------------------------------
// Kind taxonomy
// ---------------------------------------------------------------------------

/** Display labels per kind — the single source of truth the palette reuses. */
export const KIND_LABELS: Record<ComponentKind, string> = {
  'straight-belt': 'Straight Belt',
  'curved-belt': 'Curved Belt',
  'u-belt': 'U-Belt',
  incline: 'Incline',
  decline: 'Decline',
  merge: 'Merge',
  'mp-sensor': 'MP Sensor',
  'photo-eye': 'Photo-eye',
  scanner: 'Scanner',
  'bin-source': 'Bin Source',
  sink: 'Sink',
}

/** Every known component kind (drives validation of the `kind` discriminator). */
export const COMPONENT_KINDS = Object.keys(KIND_LABELS) as ComponentKind[]

/** `dataTransfer` MIME the palette writes and the canvas reads on drag-and-drop. */
export const CANVAS_DND_MIME = 'application/x-plc-canvas-kind'

/** Narrows an arbitrary string to a known {@link ComponentKind}, else `null`. */
export function toComponentKind(value: string): ComponentKind | null {
  return (COMPONENT_KINDS as string[]).includes(value) ? (value as ComponentKind) : null
}

const TRANSPORT_KINDS: ReadonlySet<ComponentKind> = new Set<ComponentKind>([
  'straight-belt',
  'curved-belt',
  'u-belt',
  'incline',
  'decline',
  'merge',
])

const SENSOR_KINDS: ReadonlySet<ComponentKind> = new Set<ComponentKind>([
  'mp-sensor',
  'photo-eye',
  'scanner',
])

const ENVIRONMENT_KINDS: ReadonlySet<ComponentKind> = new Set<ComponentKind>(['bin-source', 'sink'])

/** Whether a kind is a transport component (owns {@link TransportProps}). */
export function isTransportKind(kind: ComponentKind): boolean {
  return TRANSPORT_KINDS.has(kind)
}

/** Whether a kind is a sensor (owns {@link SensorProps}). */
export function isSensorKind(kind: ComponentKind): boolean {
  return SENSOR_KINDS.has(kind)
}

/** Whether a kind is an environment component (bin source / sink). */
export function isEnvironmentKind(kind: ComponentKind): boolean {
  return ENVIRONMENT_KINDS.has(kind)
}

/** Whether a kind carries a sweep angle (curved / U belts). */
export function hasCurveAngle(kind: ComponentKind): boolean {
  return kind === 'curved-belt' || kind === 'u-belt'
}

// ---------------------------------------------------------------------------
// Unit conversion + sizing
// ---------------------------------------------------------------------------

/** Converts real metres to canvas pixels at the layout scale. */
export function metersToPx(meters: number, units: Units): number {
  return meters * units.pixelsPerMeter
}

/** Converts canvas pixels back to real metres at the layout scale. */
export function pxToMeters(px: number, units: Units): number {
  return units.pixelsPerMeter > 0 ? px / units.pixelsPerMeter : 0
}

/** Fixed on-canvas size (px) of a sensor point. */
export const SENSOR_SIZE_PX = 16

/** Default on-canvas box (px) for environment components (bin source / sink). */
export const ENVIRONMENT_SIZE_PX = { width: 64, height: 48 } as const

/** Smallest a transport belt renders on-canvas so it stays selectable. */
const MIN_BELT_PX = 8

/**
 * The uniform belt width (the cross-travel dimension) shared by every transport
 * kind, in metres. Keeping this single value means straight, curved, U, incline,
 * decline, and merge belts all render at the same thickness so they line up when
 * connected end-to-end.
 */
export const TRANSPORT_BELT_WIDTH_METERS = 0.6

/** The on-canvas belt thickness (px) for a transport component at the given scale. */
export function beltWidthPx(component: Component, units: Units): number {
  return Math.max(MIN_BELT_PX, metersToPx(component.geometry.widthMeters, units))
}

/**
 * The rendered size of a component in canvas pixels. Straight belts derive their
 * box from real geometry × scale; curved / U belts use their arc bounding box;
 * sensors are a fixed small point; environment components use a sensible default.
 */
export function componentSizePx(component: Component, units: Units): { width: number; height: number } {
  if (isSensorKind(component.kind)) {
    return { width: SENSOR_SIZE_PX, height: SENSOR_SIZE_PX }
  }
  if (isEnvironmentKind(component.kind)) {
    return { width: ENVIRONMENT_SIZE_PX.width, height: ENVIRONMENT_SIZE_PX.height }
  }
  if (hasCurveAngle(component.kind)) {
    const curve = curveGeometry(component, units)
    return { width: curve.boxWidth, height: curve.boxHeight }
  }
  if (component.kind === 'merge') {
    // A merge fits two input lanes (each the uniform belt width) into one output.
    return {
      width: Math.max(MIN_BELT_PX, metersToPx(component.geometry.lengthMeters, units)),
      height: beltWidthPx(component, units) * 2,
    }
  }
  return {
    width: Math.max(MIN_BELT_PX, metersToPx(component.geometry.lengthMeters, units)),
    height: beltWidthPx(component, units),
  }
}

/** A point at `deg` degrees (screen space, clockwise, y-down) on a circle. */
function pointOnCircle(cx: number, cy: number, radius: number, deg: number): Vec2 {
  const rad = (deg * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

/** Resolved geometry of a curved / U belt: an annular band plus its entry/exit anchors. */
export interface CurveGeometry {
  /** Arc centre in the component's local coordinates. */
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  /** Belt centreline radius (where bins travel). */
  centerRadius: number
  /** Sweep start angle (screen degrees, clockwise). */
  startDeg: number
  angleDeg: number
  /** Local bounding box the arc occupies. */
  boxWidth: number
  boxHeight: number
  /** Entry / exit port anchors on the centreline, in local coordinates. */
  inAnchor: Vec2
  outAnchor: Vec2
}

/**
 * Derives a curved / U belt's arc from its real geometry: the band thickness equals
 * the uniform belt width and the turn radius comes from `lengthMeters`, so a curve
 * reads as the same-width belt bending through `curveAngleDeg`. The bounding box is
 * taken from the outer-arc extremes, so it stays correct for any sweep angle.
 */
export function curveGeometry(component: Component, units: Units): CurveGeometry {
  const beltW = beltWidthPx(component, units)
  const centerRadius = Math.max(beltW, metersToPx(component.geometry.lengthMeters, units))
  const outerRadius = centerRadius + beltW / 2
  const innerRadius = Math.max(1, centerRadius - beltW / 2)
  const angleDeg = component.geometry.curveAngleDeg ?? 90
  const startDeg = -90

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const steps = Math.max(8, Math.ceil(angleDeg / 5))
  for (let i = 0; i <= steps; i += 1) {
    const point = pointOnCircle(0, 0, outerRadius, startDeg + (angleDeg * i) / steps)
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const cx = -minX
  const cy = -minY
  return {
    cx,
    cy,
    innerRadius,
    outerRadius,
    centerRadius,
    startDeg,
    angleDeg,
    boxWidth: maxX - minX,
    boxHeight: maxY - minY,
    inAnchor: pointOnCircle(cx, cy, centerRadius, startDeg),
    outAnchor: pointOnCircle(cx, cy, centerRadius, startDeg + angleDeg),
  }
}

/** A component port with its resolved local-anchor position (px). */
export interface PortAnchor {
  id: string
  role: PortRole
  pos: Vec2
}

/**
 * The local-coordinate anchor of every port on a component. Straight belts / merge /
 * environment expose an entry on the left edge and an exit on the right edge; curved
 * and U belts expose the two ends of their arc. Sensors have no ports.
 */
export function componentPorts(component: Component, units: Units): PortAnchor[] {
  const size = componentSizePx(component, units)
  const curve = hasCurveAngle(component.kind) ? curveGeometry(component, units) : null
  return component.ports.map((port) => ({
    id: port.id,
    role: port.role,
    pos: curve
      ? port.role === 'in'
        ? curve.inAnchor
        : curve.outAnchor
      : port.role === 'in'
        ? { x: 0, y: size.height / 2 }
        : { x: size.width, y: size.height / 2 },
  }))
}

/** Rotates a local vector by `deg` degrees (clockwise, matching Konva group rotation). */
export function rotateVec(vec: Vec2, deg: number): Vec2 {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: vec.x * cos - vec.y * sin, y: vec.x * sin + vec.y * cos }
}

/** The world (stage) position of a local anchor on a (possibly rotated) component. */
export function portWorldPos(component: Component, anchor: Vec2): Vec2 {
  const rotated = rotateVec(anchor, component.rotation)
  return { x: component.position.x + rotated.x, y: component.position.y + rotated.y }
}

/** The owning component id encoded in a `${componentId}:in|out` port id. */
export function componentIdOfPort(portId: string): string {
  const index = portId.lastIndexOf(':')
  return index >= 0 ? portId.slice(0, index) : portId
}

/** Resolves a port id to its world (stage) position, or `null` if it can't be found. */
export function resolvePortWorld(
  components: readonly Component[],
  units: Units,
  portId: string,
): Vec2 | null {
  const component = components.find((candidate) => candidate.id === componentIdOfPort(portId))
  if (!component) return null
  const anchor = componentPorts(component, units).find((port) => port.id === portId)
  return anchor ? portWorldPos(component, anchor.pos) : null
}

function findPort(layout: CanvasLayout, portId: string): Port | null {
  const component = layout.components.find((candidate) => candidate.id === componentIdOfPort(portId))
  return component?.ports.find((port) => port.id === portId) ?? null
}

/**
 * Validates a proposed connection between two ports, normalising it to `out → in`.
 * Rejects unknown ports, same-role pairs, self-links, and duplicates.
 */
export function canConnect(
  layout: CanvasLayout,
  from: string,
  to: string,
): { ok: boolean; connection?: Connection } {
  const fromPort = findPort(layout, from)
  const toPort = findPort(layout, to)
  if (!fromPort || !toPort) return { ok: false }

  let src = from
  let dst = to
  let srcRole = fromPort.role
  let dstRole = toPort.role
  if (srcRole === 'in' && dstRole === 'out') {
    src = to
    dst = from
    srcRole = 'out'
    dstRole = 'in'
  }
  if (srcRole !== 'out' || dstRole !== 'in') return { ok: false }
  if (componentIdOfPort(src) === componentIdOfPort(dst)) return { ok: false }
  if (layout.connections.some((connection) => connection.from === src && connection.to === dst)) {
    return { ok: false }
  }
  return { ok: true, connection: { from: src, to: dst } }
}

// ---------------------------------------------------------------------------
// Id generation
// ---------------------------------------------------------------------------

let componentSequence = 0
/** A stable-enough unique id for a placed component. */
export function nextComponentId(kind: ComponentKind): string {
  componentSequence += 1
  return `${kind}-${Date.now().toString(36)}-${componentSequence}`
}

let binSequence = 0
/** A stable-enough unique id for a spawned bin. */
export function nextBinId(): string {
  binSequence += 1
  return `bin-${Date.now().toString(36)}-${binSequence}`
}

/** A random transport-unit id, e.g. `TU-8F3A0C`, carried in the telegram's `TU` field. */
export function nextTuId(): string {
  let suffix = ''
  for (let i = 0; i < 6; i += 1) {
    suffix += Math.floor(Math.random() * 36)
      .toString(36)
      .toUpperCase()
  }
  return `TU-${suffix}`
}

// ---------------------------------------------------------------------------
// Component + section defaults
// ---------------------------------------------------------------------------

/** The two in/out ports every transport belt exposes. */
function beltPorts(id: string): Port[] {
  return [
    { id: `${id}:in`, role: 'in' },
    { id: `${id}:out`, role: 'out' },
  ]
}

/** The default {@link SensorProps} for a freshly-placed sensor. */
function defaultSensorProps(seq: number): SensorProps {
  return {
    telegramTypeId: 'MP',
    mpId: `MP${seq}`,
    fieldBindings: [
      { field: 'MP', source: 'mpId' },
      { field: 'TU', source: 'bin.tuId' },
    ],
  }
}

/** The default {@link TransportProps} for a freshly-placed belt. */
function defaultTransportProps(): TransportProps {
  return { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 }
}

/** The default real-unit geometry per kind. */
function defaultGeometry(kind: ComponentKind): Geometry {
  const width = TRANSPORT_BELT_WIDTH_METERS
  switch (kind) {
    case 'straight-belt':
      return { lengthMeters: 5, widthMeters: width, direction: 'east' }
    case 'incline':
      return { lengthMeters: 3, widthMeters: width, direction: 'east' }
    case 'decline':
      return { lengthMeters: 3, widthMeters: width, direction: 'east' }
    case 'curved-belt':
      return { lengthMeters: 1.2, widthMeters: width, curveAngleDeg: 90, direction: 'east' }
    case 'u-belt':
      return { lengthMeters: 1.2, widthMeters: width, curveAngleDeg: 180, direction: 'east' }
    case 'merge':
      return { lengthMeters: 1.5, widthMeters: width, direction: 'east' }
    case 'bin-source':
    case 'sink':
      return { lengthMeters: 1, widthMeters: 1 }
    default:
      // Sensors: a small footprint (rendered as a fixed point regardless).
      return { lengthMeters: 0.4, widthMeters: 0.4 }
  }
}

/** The default ports per kind (belts in/out, source out, sink in, sensors none). */
function defaultPorts(kind: ComponentKind, id: string): Port[] {
  if (isTransportKind(kind)) return beltPorts(id)
  if (kind === 'bin-source') return [{ id: `${id}:out`, role: 'out' }]
  if (kind === 'sink') return [{ id: `${id}:in`, role: 'in' }]
  return []
}

/**
 * A fully-formed {@link Component} of `kind` with sensible defaults. `seq` seeds
 * per-kind labels/ids (e.g. an MP sensor's `mpId`).
 */
export function defaultComponent(kind: ComponentKind, seq: number): Component {
  const id = nextComponentId(kind)
  const component: Component = {
    id,
    kind,
    label: KIND_LABELS[kind],
    position: { x: 0, y: 0 },
    rotation: 0,
    geometry: defaultGeometry(kind),
    ports: defaultPorts(kind, id),
  }
  if (isTransportKind(kind)) component.transport = defaultTransportProps()
  if (isSensorKind(kind)) component.sensor = defaultSensorProps(seq)
  return component
}

/** The default canvas scale used when a layout omits or corrupts `units`. */
export function defaultUnits(): Units {
  return { pixelsPerMeter: 40, lengthUnit: 'm' }
}

/** The default (empty) bin source. */
export function defaultBinSource(): BinSource {
  return { id: 'bin-source', types: [] }
}

/** The default global control-logic tunables. */
export function defaultControlLogic(): ControlLogic {
  return { minBinDistanceMeters: 0.3, conveyorSpeedScale: 1 }
}

/** An empty-but-valid layout, used as the validator's per-section fallback. */
export function emptyLayout(): CanvasLayout {
  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    units: defaultUnits(),
    components: [],
    connections: [],
    binSource: defaultBinSource(),
    areas: [],
    controlLogic: defaultControlLogic(),
  }
}

// ---------------------------------------------------------------------------
// Defensive validation (ADR-0008 safe-import rule)
// ---------------------------------------------------------------------------

/** The result of validating an untrusted layout value. */
export type ValidationResult =
  | { ok: true; layout: CanvasLayout; errors: string[] }
  | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west']
const CONVEYOR_STATES: readonly ConveyorState[] = ['Running', 'Stopped', 'Jammed', 'Maintenance']
const PORT_ROLES: readonly PortRole[] = ['in', 'out']
const BINDING_SOURCES: readonly FieldBindingSource[] = ['mpId', 'bin.tuId']

function sanitizeUnits(value: unknown): Units {
  if (!isRecord(value)) return defaultUnits()
  return {
    pixelsPerMeter:
      isFiniteNumber(value.pixelsPerMeter) && value.pixelsPerMeter > 0 ? value.pixelsPerMeter : 40,
    lengthUnit: isNonEmptyString(value.lengthUnit) ? value.lengthUnit : 'm',
  }
}

function sanitizeVec2(value: unknown): Vec2 {
  if (!isRecord(value)) return { x: 0, y: 0 }
  return {
    x: isFiniteNumber(value.x) ? value.x : 0,
    y: isFiniteNumber(value.y) ? value.y : 0,
  }
}

function sanitizeGeometry(value: unknown): Geometry {
  const source = isRecord(value) ? value : {}
  const geometry: Geometry = {
    lengthMeters: isFiniteNumber(source.lengthMeters) && source.lengthMeters > 0 ? source.lengthMeters : 1,
    widthMeters: isFiniteNumber(source.widthMeters) && source.widthMeters > 0 ? source.widthMeters : 0.6,
  }
  if (isFiniteNumber(source.curveAngleDeg)) geometry.curveAngleDeg = source.curveAngleDeg
  if (isOneOf(DIRECTIONS, source.direction)) geometry.direction = source.direction
  return geometry
}

function sanitizePorts(value: unknown): Port[] {
  if (!Array.isArray(value)) return []
  const ports: Port[] = []
  for (const entry of value) {
    if (isRecord(entry) && isNonEmptyString(entry.id) && isOneOf(PORT_ROLES, entry.role)) {
      ports.push({ id: entry.id, role: entry.role })
    }
  }
  return ports
}

function sanitizeTransport(value: Record<string, unknown>): TransportProps {
  const friction = isFiniteNumber(value.friction) ? Math.min(1, Math.max(0, value.friction)) : 0.2
  return {
    speedMps: isFiniteNumber(value.speedMps) && value.speedMps >= 0 ? value.speedMps : 0.5,
    state: isOneOf(CONVEYOR_STATES, value.state) ? value.state : 'Running',
    maxWeightKg: isFiniteNumber(value.maxWeightKg) && value.maxWeightKg >= 0 ? value.maxWeightKg : 50,
    friction,
  }
}

function sanitizeFieldBindings(value: unknown): FieldBinding[] {
  if (!Array.isArray(value)) return []
  const bindings: FieldBinding[] = []
  for (const entry of value) {
    if (isRecord(entry) && isNonEmptyString(entry.field) && isOneOf(BINDING_SOURCES, entry.source)) {
      bindings.push({ field: entry.field, source: entry.source })
    }
  }
  return bindings
}

function sanitizeSensor(value: Record<string, unknown>): SensorProps {
  return {
    telegramTypeId: isNonEmptyString(value.telegramTypeId) ? value.telegramTypeId : 'MP',
    mpId: typeof value.mpId === 'string' ? value.mpId : '',
    fieldBindings: sanitizeFieldBindings(value.fieldBindings),
  }
}

/** Normalises one untrusted component, or returns `null` when it must be dropped. */
function sanitizeComponent(value: unknown): Component | null {
  if (!isRecord(value)) return null
  if (!isNonEmptyString(value.id)) return null
  if (!isOneOf(COMPONENT_KINDS, value.kind)) return null

  const component: Component = {
    id: value.id,
    kind: value.kind,
    label: isNonEmptyString(value.label) ? value.label : KIND_LABELS[value.kind],
    position: sanitizeVec2(value.position),
    rotation: isFiniteNumber(value.rotation) ? value.rotation : 0,
    geometry: sanitizeGeometry(value.geometry),
    ports: sanitizePorts(value.ports),
  }
  if (isRecord(value.transport)) component.transport = sanitizeTransport(value.transport)
  if (isRecord(value.sensor)) component.sensor = sanitizeSensor(value.sensor)
  return component
}

function sanitizeConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) return []
  const connections: Connection[] = []
  for (const entry of value) {
    if (isRecord(entry) && isNonEmptyString(entry.from) && isNonEmptyString(entry.to)) {
      connections.push({ from: entry.from, to: entry.to })
    }
  }
  return connections
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNonEmptyString)
}

function sanitizeAreas(value: unknown): Area[] {
  if (!Array.isArray(value)) return []
  const areas: Area[] = []
  for (const entry of value) {
    if (!isRecord(entry) || !isNonEmptyString(entry.id)) continue
    areas.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : '',
      memberComponentIds: sanitizeStringArray(entry.memberComponentIds),
      mpSensorIds: sanitizeStringArray(entry.mpSensorIds),
    })
  }
  return areas
}

function sanitizeBinTypes(value: unknown): BinType[] {
  if (!Array.isArray(value)) return []
  const types: BinType[] = []
  for (const entry of value) {
    if (!isRecord(entry) || !isNonEmptyString(entry.typeId)) continue
    types.push({
      typeId: entry.typeId,
      color: isNonEmptyString(entry.color) ? entry.color : '#3b82f6',
      count: isFiniteNumber(entry.count) && entry.count >= 0 ? entry.count : 0,
    })
  }
  return types
}

function sanitizeBinSource(value: unknown): BinSource {
  if (!isRecord(value)) return defaultBinSource()
  return {
    id: isNonEmptyString(value.id) ? value.id : 'bin-source',
    types: sanitizeBinTypes(value.types),
  }
}

function sanitizeControlLogic(value: unknown): ControlLogic {
  if (!isRecord(value)) return defaultControlLogic()
  return {
    minBinDistanceMeters:
      isFiniteNumber(value.minBinDistanceMeters) && value.minBinDistanceMeters >= 0
        ? value.minBinDistanceMeters
        : 0.3,
    conveyorSpeedScale:
      isFiniteNumber(value.conveyorSpeedScale) && value.conveyorSpeedScale > 0
        ? value.conveyorSpeedScale
        : 1,
  }
}

/**
 * Validates an untrusted value into a fully-populated {@link CanvasLayout}, never
 * throwing (ADR-0008 safe import). A non-object top level fails; otherwise every
 * section is coerced, missing sections fall back to defaults, unknown fields are
 * ignored, and individually invalid components/entries are dropped and reported.
 */
export function validateCanvasLayout(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Layout must be a JSON object.'] }
  }

  const errors: string[] = []

  let schemaVersion = CANVAS_SCHEMA_VERSION
  if (isFiniteNumber(value.schemaVersion)) {
    schemaVersion = value.schemaVersion
  } else if ('schemaVersion' in value) {
    errors.push(`Ignored non-numeric schemaVersion; defaulted to ${CANVAS_SCHEMA_VERSION}.`)
  }

  const components: Component[] = []
  if (Array.isArray(value.components)) {
    value.components.forEach((entry, index) => {
      const sanitized = sanitizeComponent(entry)
      if (sanitized) components.push(sanitized)
      else errors.push(`Dropped invalid component at index ${index}.`)
    })
  } else if ('components' in value) {
    errors.push('Ignored non-array components.')
  }

  const layout: CanvasLayout = {
    schemaVersion,
    units: sanitizeUnits(value.units),
    components,
    connections: sanitizeConnections(value.connections),
    binSource: sanitizeBinSource(value.binSource),
    areas: sanitizeAreas(value.areas),
    controlLogic: sanitizeControlLogic(value.controlLogic),
  }

  return { ok: true, layout, errors }
}

// ---------------------------------------------------------------------------
// (De)serialisation
// ---------------------------------------------------------------------------

/** Serialises a layout to pretty, diffable JSON. */
export function serializeLayout(layout: CanvasLayout): string {
  return JSON.stringify(layout, null, 2)
}

/** Parses + validates a JSON layout string, never throwing on bad input. */
export function parseLayout(json: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`Invalid JSON: ${message}`] }
  }
  return validateCanvasLayout(parsed)
}

// ---------------------------------------------------------------------------
// Transient preview motion (backend-authoritative at run time — ADR-0012)
// ---------------------------------------------------------------------------

/** A sensor's axis-aligned pixel bounds, precomputed for hit-testing. */
export interface SensorRect {
  id: string
  /** Message-point id, present on MP sensors — the value reported to the backend. */
  mpId?: string
  x: number
  y: number
  width: number
  height: number
}

/** Largest frame delta integrated in one step (guards against tab-refocus jumps). */
const MAX_STEP_MS = 100

/** Vertical band (px) within which two bins count as sharing a belt lane for queuing. */
const LANE_TOLERANCE_PX = 10

/** Shared empty set so the common (no-blocking) path allocates nothing. */
const NO_BLOCKED: ReadonlySet<string> = new Set<string>()

/** Whether a bin's centre currently lies within a sensor's pixel bounds. */
export function binOverSensor(bin: Bin, sensor: SensorRect): boolean {
  return (
    bin.x >= sensor.x &&
    bin.x <= sensor.x + sensor.width &&
    bin.y >= sensor.y &&
    bin.y <= sensor.y + sensor.height
  )
}

/** Inputs to a single preview-simulation step. */
export interface AdvanceInput {
  bins: readonly Bin[]
  sensors: readonly SensorRect[]
  dtMs: number
  speed: SimSpeed
  /** Right edge (px) past which a bin leaves the stage and is removed. */
  maxX: number
  /** Belt travel speed at 1x, in px/second. */
  baseSpeedPxPerSec: number
  /**
   * Transport-unit ids currently awaiting a transport order (ADR-0012). A blocked
   * bin holds its position; bins queued behind it on the same lane cannot pass it.
   * Defaults to none, so the plain preview path is unchanged.
   */
  blocked?: ReadonlySet<string>
  /** Minimum gap (px) a trailing bin keeps behind the bin ahead on its lane. */
  minGapPx?: number
}

/** Result of a preview step: surviving bins and the sensors a bin now sits over. */
export interface AdvanceResult {
  bins: Bin[]
  /** Ids of sensors currently covered by a bin (drives the trigger glow). */
  triggered: Set<string>
}

/**
 * Advances every bin along +x by one step and reports which sensors a bin now
 * covers. Bins whose `tuId` is in `blocked` hold position (they are awaiting a
 * transport order from the backend, ADR-0012), and a moving bin is clamped so it
 * never overtakes a bin ahead of it on the same lane — so a bin waiting at a
 * message point queues the bins behind it, exactly as on the real conveyor.
 *
 * Pure: no timers, no DOM — the page drives it from `requestAnimationFrame`.
 */
export function advance({
  bins,
  sensors,
  dtMs,
  speed,
  maxX,
  baseSpeedPxPerSec,
  blocked = NO_BLOCKED,
  minGapPx = 0,
}: AdvanceInput): AdvanceResult {
  const step = Math.max(0, Math.min(dtMs, MAX_STEP_MS))
  const dx = (baseSpeedPxPerSec * step * speed) / 1000

  // Resolve front-most (largest x) bins first so trailing bins can queue behind
  // their already-settled positions on the same lane.
  const order = bins.map((_, index) => index).sort((a, b) => bins[b].x - bins[a].x)
  const settled: Bin[] = []
  const placedByIndex = new Map<number, Bin>()

  for (const index of order) {
    const bin = bins[index]
    let targetX = blocked.has(bin.tuId) ? bin.x : bin.x + dx

    for (const ahead of settled) {
      if (Math.abs(ahead.y - bin.y) > LANE_TOLERANCE_PX) continue
      if (ahead.x < bin.x) continue // only bins ahead of this one constrain it
      targetX = Math.min(targetX, ahead.x - minGapPx)
    }

    const placed: Bin = { ...bin, x: Math.max(bin.x, targetX) }
    settled.push(placed)
    placedByIndex.set(index, placed)
  }

  const moved: Bin[] = []
  for (let index = 0; index < bins.length; index += 1) {
    const placed = placedByIndex.get(index)
    if (placed && placed.x <= maxX) moved.push(placed)
  }

  const triggered = new Set<string>()
  for (const sensor of sensors) {
    if (moved.some((bin) => binOverSensor(bin, sensor))) triggered.add(sensor.id)
  }

  return { bins: moved, triggered }
}
