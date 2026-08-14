import { TELEGRAM_TYPE_OPTIONS, kindIcon, kindLabel, telegramFieldNames } from './defaults'
import { hasCurveAngle, isSensorKind, isTransportKind } from './layout'
import type { Component, ConveyorState, Direction, FieldBindingSource } from './types'
import { Icon } from '@/components/ui/Icon'

interface PropertyInspectorProps {
  component: Component | null
  draft: Component | null
  isDirty: boolean
  onChange: (patch: Partial<Component>) => void
  onApply: () => void
  onRevert: () => void
  onDelete: (id: string) => void
  onClose: () => void
}

const CONVEYOR_STATES: readonly ConveyorState[] = ['Running', 'Stopped', 'Jammed', 'Maintenance']
const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west']
const BINDING_SOURCES: readonly FieldBindingSource[] = ['mpId', 'bin.tuId']

const FIELD =
  'w-full rounded border border-outline-variant bg-surface-container p-2 font-data-mono text-[11px] text-on-surface focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary'
const SELECT = `${FIELD} cursor-pointer appearance-none`
const LABEL = 'font-label-xs text-label-xs uppercase text-on-surface-variant'

/** Parses an input value to a finite number, falling back to `fallback`. */
function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * The right-hand property inspector: edits the selected component as a draft
 * (Apply/Revert). Transport kinds expose real-unit engineering fields; sensor
 * kinds expose the emitted telegram type, MP id, and field bindings.
 */
export function PropertyInspector({
  component,
  draft,
  isDirty,
  onChange,
  onApply,
  onRevert,
  onDelete,
  onClose,
}: PropertyInspectorProps) {
  return (
    <aside
      aria-label="Property inspector"
      className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low"
    >
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high px-3 py-2">
        <h2 className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">
          Property Inspector
        </h2>
        {component ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDelete(component.id)}
              aria-label="Delete component"
              className="text-on-surface-variant transition-colors hover:text-error"
            >
              <Icon name="delete" className="text-[16px]" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        ) : null}
      </div>

      {component && draft ? (
        <>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded border border-secondary bg-surface-variant">
                <Icon name={kindIcon(component.kind)} className="text-secondary" filled />
              </div>
              <div>
                <h3 className="font-body-md font-bold text-on-surface">{kindLabel(component.kind)}</h3>
                <p className="font-data-mono text-[11px] text-on-surface-variant">{component.id}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {isTransportKind(component.kind) ? (
                <TransportFields draft={draft} onChange={onChange} />
              ) : null}
              {isSensorKind(component.kind) ? (
                <SensorFields draft={draft} onChange={onChange} />
              ) : null}
            </div>
          </div>

          <div className="flex gap-2 border-t border-outline-variant p-4">
            <button
              type="button"
              onClick={onRevert}
              disabled={!isDirty}
              className="flex-1 rounded border border-outline-variant py-2 text-sm text-on-surface transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-40"
            >
              Revert
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={!isDirty}
              className="flex-1 rounded bg-primary py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-fixed-dim disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-on-surface-variant/70">
          <Icon name="ads_click" weight={300} className="text-3xl" />
          <p className="font-body-sm text-body-sm">Select a component to edit its properties.</p>
        </div>
      )}
    </aside>
  )
}

/** Real-unit engineering fields for transport components. */
function TransportFields({
  draft,
  onChange,
}: {
  draft: Component
  onChange: (patch: Partial<Component>) => void
}) {
  const transport = draft.transport ?? {
    speedMps: 0,
    state: 'Running' as ConveyorState,
    maxWeightKg: 0,
    friction: 0,
  }
  const { geometry } = draft

  return (
    <>
      <NumberField
        id="prop-speed"
        label="Speed (m/s)"
        value={transport.speedMps}
        step={0.1}
        min={0}
        onChange={(value) => onChange({ transport: { ...transport, speedMps: value } })}
      />
      <NumberField
        id="prop-length"
        label="Length (m)"
        value={geometry.lengthMeters}
        step={0.1}
        min={0}
        onChange={(value) => onChange({ geometry: { ...geometry, lengthMeters: value } })}
      />
      <NumberField
        id="prop-width"
        label="Width (m)"
        value={geometry.widthMeters}
        step={0.1}
        min={0}
        onChange={(value) => onChange({ geometry: { ...geometry, widthMeters: value } })}
      />
      <NumberField
        id="prop-max-weight"
        label="Max Weight (kg)"
        value={transport.maxWeightKg}
        step={1}
        min={0}
        onChange={(value) => onChange({ transport: { ...transport, maxWeightKg: value } })}
      />
      <NumberField
        id="prop-friction"
        label="Friction"
        value={transport.friction}
        step={0.05}
        min={0}
        max={1}
        onChange={(value) => onChange({ transport: { ...transport, friction: value } })}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="prop-state" className={LABEL}>
          State
        </label>
        <select
          id="prop-state"
          value={transport.state}
          onChange={(event) =>
            onChange({ transport: { ...transport, state: event.target.value as ConveyorState } })
          }
          className={SELECT}
        >
          {CONVEYOR_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="prop-direction" className={LABEL}>
          Direction
        </label>
        <select
          id="prop-direction"
          value={geometry.direction ?? 'east'}
          onChange={(event) =>
            onChange({ geometry: { ...geometry, direction: event.target.value as Direction } })
          }
          className={SELECT}
        >
          {DIRECTIONS.map((direction) => (
            <option key={direction} value={direction}>
              {direction}
            </option>
          ))}
        </select>
      </div>

      {hasCurveAngle(draft.kind) ? (
        <NumberField
          id="prop-curve-angle"
          label="Curve Angle (deg)"
          value={geometry.curveAngleDeg ?? 90}
          step={5}
          min={0}
          max={360}
          onChange={(value) => onChange({ geometry: { ...geometry, curveAngleDeg: value } })}
        />
      ) : null}
    </>
  )
}

/** Telegram binding fields for sensor components. */
function SensorFields({
  draft,
  onChange,
}: {
  draft: Component
  onChange: (patch: Partial<Component>) => void
}) {
  const sensor = draft.sensor ?? { telegramTypeId: 'MP', mpId: '', fieldBindings: [] }
  const telegramFields = telegramFieldNames(sensor.telegramTypeId)
  const fieldOptions = Array.from(
    new Set([...telegramFields, ...sensor.fieldBindings.map((binding) => binding.field)]),
  )

  const updateBinding = (index: number, patch: Partial<{ field: string; source: FieldBindingSource }>) => {
    const fieldBindings = sensor.fieldBindings.map((binding, current) =>
      current === index ? { ...binding, ...patch } : binding,
    )
    onChange({ sensor: { ...sensor, fieldBindings } })
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="prop-telegram-type" className={LABEL}>
          Telegram Type
        </label>
        <select
          id="prop-telegram-type"
          value={sensor.telegramTypeId}
          onChange={(event) => onChange({ sensor: { ...sensor, telegramTypeId: event.target.value } })}
          className={SELECT}
        >
          {TELEGRAM_TYPE_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="prop-mp-id" className={LABEL}>
          MP ID
        </label>
        <input
          id="prop-mp-id"
          type="text"
          value={sensor.mpId}
          spellCheck={false}
          onChange={(event) => onChange({ sensor: { ...sensor, mpId: event.target.value } })}
          className={FIELD}
        />
      </div>

      <div className="my-1 h-px w-full bg-outline-variant" />

      <div className="flex flex-col gap-2">
        <span className={LABEL}>Field Bindings</span>
        {sensor.fieldBindings.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant/70">No field bindings.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sensor.fieldBindings.map((binding, index) => (
              <li key={index} className="flex items-center gap-2">
                <select
                  aria-label={`Binding ${index + 1} field`}
                  value={binding.field}
                  onChange={(event) => updateBinding(index, { field: event.target.value })}
                  className={`${SELECT} flex-1`}
                >
                  {fieldOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <Icon name="west" className="text-[16px] text-on-surface-variant" />
                <select
                  aria-label={`Binding ${index + 1} source`}
                  value={binding.source}
                  onChange={(event) =>
                    updateBinding(index, { source: event.target.value as FieldBindingSource })
                  }
                  className={`${SELECT} flex-1`}
                >
                  {BINDING_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded border border-outline-variant">
        <table className="w-full text-left font-data-mono text-[11px]">
          <caption className="sr-only">Telegram fields</caption>
          <thead className="border-b border-outline-variant bg-surface-container-high">
            <tr>
              <th scope="col" className="p-2 font-normal text-on-surface-variant">
                Field
              </th>
            </tr>
          </thead>
          <tbody>
            {telegramFields.map((name) => (
              <tr key={name} className="border-b border-outline-variant/50 last:border-b-0">
                <td className="p-2 text-on-surface">{name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  value: number
  step: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

/** A labelled numeric input that coerces its value to a finite number. */
function NumberField({ id, label, value, step, min, max, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(event) => onChange(toNumber(event.target.value, value))}
        className={FIELD}
      />
    </div>
  )
}
