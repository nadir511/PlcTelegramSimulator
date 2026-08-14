/**
 * Domain types for the Conveyor Simulation Canvas.
 *
 * The persisted, versioned `CanvasLayout` (ADR-0013) is the design-time contract:
 * real engineering units (metres, m/s) plus a canvas scale; runtime bin motion is
 * transient and stays backend-authoritative (ADR-0012). Component `position` is in
 * canvas pixels; component *size* derives from `geometry` × `units.pixelsPerMeter`.
 */

/** A point in canvas pixels. */
export interface Vec2 {
  x: number
  y: number
}

/** The canvas scale: how many pixels represent one real metre, and the unit label. */
export interface Units {
  pixelsPerMeter: number
  lengthUnit: string
}

/** The component kinds that can be placed on the canvas, grouped in the palette. */
export type ComponentKind =
  | 'straight-belt'
  | 'curved-belt'
  | 'u-belt'
  | 'incline'
  | 'decline'
  | 'merge'
  | 'mp-sensor'
  | 'photo-eye'
  | 'scanner'
  | 'bin-source'
  | 'sink'

/** Operating state of a transport component. */
export type ConveyorState = 'Running' | 'Stopped' | 'Jammed' | 'Maintenance'

/** Cardinal travel direction of a transport component. */
export type Direction = 'north' | 'east' | 'south' | 'west'

/** Real-unit geometry of a component; canvas size is derived from this at render time. */
export interface Geometry {
  /** Length along the travel axis, in metres. */
  lengthMeters: number
  /** Width across the travel axis, in metres. */
  widthMeters: number
  /** Sweep angle for curved/U belts, in degrees. */
  curveAngleDeg?: number
  /** Travel direction; drives the on-canvas arrow. */
  direction?: Direction
}

/** Whether a port feeds bins in or lets them out. */
export type PortRole = 'in' | 'out'

/** A named connection point on a component; `connections[]` link ports into a graph. */
export interface Port {
  id: string
  role: PortRole
}

/** Engineering properties owned by transport components. */
export interface TransportProps {
  /** Belt speed, in metres per second. */
  speedMps: number
  state: ConveyorState
  /** Maximum bin weight the belt carries, in kilograms. */
  maxWeightKg: number
  /** Friction 0–1; higher slows bins (design-time hint; runtime is backend-owned). */
  friction: number
}

/** Where a sensor's bound telegram field takes its value from. */
export type FieldBindingSource = 'mpId' | 'bin.tuId'

/** Wires one telegram field to a runtime source (e.g. `MP` ← `mpId`, `TU` ← `bin.tuId`). */
export interface FieldBinding {
  /** Telegram field name this binding fills (e.g. `MP`, `TU`). */
  field: string
  source: FieldBindingSource
}

/** Sensor properties: the telegram it emits and how its fields are bound. */
export interface SensorProps {
  /** Code of the telegram type this sensor emits (references ADR-0009 telegram types). */
  telegramTypeId: string
  /** Unique message-point id (MP sensors); the user binds it into the telegram's `MP` field. */
  mpId: string
  /** Field-to-source bindings feeding the emitted telegram. */
  fieldBindings: FieldBinding[]
}

/**
 * A component placed on the canvas. `position` is in canvas pixels; the visual size
 * derives from {@link Geometry} × `units.pixelsPerMeter`. Only transport kinds carry
 * {@link TransportProps}; only sensor kinds carry {@link SensorProps}.
 */
export interface Component {
  /** Stable id for React keys, selection, ports, and edits. */
  id: string
  kind: ComponentKind
  /** Human label shown on the node and inspector header (additive display field). */
  label: string
  /** Top-left position within the stage, in canvas pixels. */
  position: Vec2
  /** Clockwise rotation in degrees. */
  rotation: number
  geometry: Geometry
  ports: Port[]
  transport?: TransportProps
  sensor?: SensorProps
}

/** A directed link between two component ports (out → in). */
export interface Connection {
  /** Source port id. */
  from: string
  /** Target port id. */
  to: string
}

/** A configurable bin type held by the bin source (colour + how many to spawn). */
export interface BinType {
  typeId: string
  color: string
  count: number
}

/** The bin source: the pool of bin types the simulation spawns from. */
export interface BinSource {
  id: string
  types: BinType[]
}

/** A named grouping of components / MP-sensors (maps to a backend zone later). */
export interface Area {
  id: string
  name: string
  memberComponentIds: string[]
  mpSensorIds: string[]
}

/** Global simulation tunables. */
export interface ControlLogic {
  /** Minimum spacing kept between bins, in metres. */
  minBinDistanceMeters: number
  /** Multiplier applied to every belt's speed. */
  conveyorSpeedScale: number
}

/**
 * The whole persisted, versioned canvas configuration. Structured so a future
 * ADR-0008 profile can wrap it under a `canvas` key without reshaping it.
 */
export interface CanvasLayout {
  schemaVersion: number
  units: Units
  components: Component[]
  connections: Connection[]
  binSource: BinSource
  areas: Area[]
  controlLogic: ControlLogic
}

/** Current schema version of {@link CanvasLayout}. Bump on breaking changes. */
export const CANVAS_SCHEMA_VERSION = 1

/**
 * A transient bin travelling the belts during the preview simulation. NOT part of
 * {@link CanvasLayout} — runtime authority is the backend (ADR-0012); this is a
 * local design-time preview only.
 */
export interface Bin {
  /** Stable id for React keys. */
  id: string
  /** Transport-unit id carried in the telegram's `TU` field. */
  tuId: string
  /** Bin type id (from the bin source). */
  typeId: string
  /** Fill colour, from the bin type. */
  color: string
  /** Centre x within the stage, in canvas pixels. */
  x: number
  /** Centre y within the stage, in canvas pixels. */
  y: number
}

/** Lifecycle of the (transient) preview simulation clock. */
export type SimStatus = 'idle' | 'running' | 'paused'

/** Playback speed multiplier for the preview simulation clock. */
export type SimSpeed = 1 | 2 | 5

/** A single tile in the component palette. */
export interface PaletteItem {
  kind: ComponentKind
  label: string
  /** Material Symbols ligature name. */
  icon: string
}

/** A titled group of palette items (e.g. `Transport`). */
export interface PaletteGroup {
  title: string
  items: readonly PaletteItem[]
}
