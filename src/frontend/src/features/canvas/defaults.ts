import { SEED_TELEGRAM_TYPES } from '@/features/telegrams/defaults'
import { KIND_LABELS } from './layout'
import type {
  CanvasLayout,
  Component,
  ComponentKind,
  PaletteGroup,
  PaletteItem,
  SimSpeed,
  Units,
} from './types'
import { CANVAS_SCHEMA_VERSION } from './types'

/** The canvas scale used by new layouts: 40 px per real metre. */
export const DEFAULT_UNITS: Units = { pixelsPerMeter: 40, lengthUnit: 'm' }

/** Belt travel speed at 1x, in px/second (drives the transient preview). */
export const BASE_BELT_SPEED_PX_PER_SEC = 60

/** Speed multipliers offered by the controls, in display order. */
export const SIM_SPEEDS: readonly SimSpeed[] = [1, 2, 5]

/** Material Symbols ligature per component kind, surfaced on the palette + inspector. */
const KIND_ICONS: Record<ComponentKind, string> = {
  'straight-belt': 'linear_scale',
  'curved-belt': 'call_split',
  'u-belt': 'u_turn_left',
  incline: 'trending_up',
  decline: 'trending_down',
  merge: 'merge_type',
  'mp-sensor': 'my_location',
  'photo-eye': 'sensors',
  scanner: 'barcode_reader',
  'bin-source': 'input',
  sink: 'output',
}

/** Builds a palette tile for a kind, reusing the shared label + icon maps. */
function tile(kind: ComponentKind): PaletteItem {
  return { kind, label: KIND_LABELS[kind], icon: KIND_ICONS[kind] }
}

/** The palette, grouped: Transport, Sensors, Environment (ADR-0013 taxonomy). */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  {
    title: 'Transport',
    items: [
      tile('straight-belt'),
      tile('curved-belt'),
      tile('u-belt'),
      tile('incline'),
      tile('decline'),
      tile('merge'),
    ],
  },
  {
    title: 'Sensors',
    items: [tile('mp-sensor'), tile('photo-eye'), tile('scanner')],
  },
  {
    title: 'Environment',
    items: [tile('bin-source'), tile('sink')],
  },
]

/** Per-kind label + icon lookups, derived once from the palette. */
const KIND_META = Object.fromEntries(
  PALETTE_GROUPS.flatMap((group) => group.items.map((item) => [item.kind, item])),
) as Record<ComponentKind, PaletteItem>

/** Display label for a component kind, e.g. `Straight Belt`. */
export function kindLabel(kind: ComponentKind): string {
  return KIND_META[kind].label
}

/** Material Symbols icon for a component kind. */
export function kindIcon(kind: ComponentKind): string {
  return KIND_META[kind].icon
}

/** Telegram type codes a sensor can emit (from the ADR-0009 seed registry). */
export const TELEGRAM_TYPE_OPTIONS: readonly string[] = SEED_TELEGRAM_TYPES.map((type) => type.code)

/**
 * The flattened field names of a telegram type, for the sensor field-binding UI.
 * Falls back to `['MP', 'TU']` when the code is unknown so the picker is never empty.
 */
export function telegramFieldNames(code: string): string[] {
  const type = SEED_TELEGRAM_TYPES.find((candidate) => candidate.code === code)
  if (!type) return ['MP', 'TU']
  const names = type.groups.flatMap((group) => group.fields.map((field) => field.name))
  return names.length > 0 ? names : ['MP', 'TU']
}

/**
 * The seeded layout shown on first load: a straight belt fed by a bin source, a
 * curved belt continuing it, and an MP sensor over the belt — the ADR-0013
 * recommended "one straight belt + one MP sensor" slice, plus a little taxonomy.
 */
export function defaultLayout(): CanvasLayout {
  const belt: Component = {
    id: 'belt-1',
    kind: 'straight-belt',
    label: 'Inbound Belt',
    position: { x: 120, y: 220 },
    rotation: 0,
    geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
    ports: [
      { id: 'belt-1:in', role: 'in' },
      { id: 'belt-1:out', role: 'out' },
    ],
    transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
  }

  const curve: Component = {
    id: 'curve-2',
    kind: 'curved-belt',
    label: 'Corner',
    position: { x: 330, y: 220 },
    rotation: 0,
    geometry: { lengthMeters: 1.2, widthMeters: 0.6, curveAngleDeg: 90, direction: 'east' },
    ports: [
      { id: 'curve-2:in', role: 'in' },
      { id: 'curve-2:out', role: 'out' },
    ],
    transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.25 },
  }

  const mpSensor: Component = {
    id: 'mp-10',
    kind: 'mp-sensor',
    label: 'MP Sensor',
    position: { x: 288, y: 224 },
    rotation: 0,
    geometry: { lengthMeters: 0.4, widthMeters: 0.4 },
    ports: [],
    sensor: {
      telegramTypeId: 'MP',
      mpId: 'MP10',
      fieldBindings: [
        { field: 'MP', source: 'mpId' },
        { field: 'TU', source: 'bin.tuId' },
      ],
    },
  }

  const source: Component = {
    id: 'src-1',
    kind: 'bin-source',
    label: 'Bin Source',
    position: { x: 40, y: 208 },
    rotation: 0,
    geometry: { lengthMeters: 1, widthMeters: 1 },
    ports: [{ id: 'src-1:out', role: 'out' }],
  }

  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    units: DEFAULT_UNITS,
    components: [source, belt, curve, mpSensor],
    connections: [
      { from: 'src-1:out', to: 'belt-1:in' },
      { from: 'belt-1:out', to: 'curve-2:in' },
    ],
    binSource: {
      id: 'src-1',
      types: [
        { typeId: 'TOTE', color: '#3b82f6', count: 20 },
        { typeId: 'CARTON', color: '#f59e0b', count: 10 },
      ],
    },
    areas: [
      {
        id: 'area-inbound',
        name: 'Inbound',
        memberComponentIds: ['belt-1', 'curve-2'],
        mpSensorIds: ['MP10'],
      },
    ],
    controlLogic: { minBinDistanceMeters: 0.3, conveyorSpeedScale: 1 },
  }
}

/** Id of the component selected on first load (the seeded MP sensor). */
export const SEED_SELECTED_ID = 'mp-10'
