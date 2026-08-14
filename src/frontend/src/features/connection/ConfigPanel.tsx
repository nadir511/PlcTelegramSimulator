import type { ReactNode } from 'react'
import type { ConfigErrors } from './format'
import type { ListenerConfig } from './types'
import { Icon } from '@/components/ui/Icon'

interface ConfigPanelProps {
  config: ListenerConfig
  errors: ConfigErrors
  /** Fields are locked while the listener is running. */
  disabled: boolean
  onChange: (config: ListenerConfig) => void
}

interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  children: (describedBy: string | undefined) => ReactNode
}

function Field({ id, label, error, hint, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-label-xs text-label-xs uppercase text-on-surface-variant">
        {label}
      </label>
      {children(describedBy)}
      {hint ? (
        <p id={hintId} className="font-label-xs text-label-xs text-on-surface-variant/70">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="font-label-xs text-label-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const INPUT_CLASS =
  'w-full rounded bg-background border border-outline-variant px-3 py-2 font-data-mono text-data-mono text-on-surface ' +
  'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed aria-[invalid=true]:border-error'

/** Left column: the editable TCP listener configuration. */
export function ConfigPanel({ config, errors, disabled, onChange }: ConfigPanelProps) {
  const update = <K extends keyof ListenerConfig>(key: K, value: ListenerConfig[K]): void =>
    onChange({ ...config, [key]: value })

  const numberValue = (value: number): number | '' => (Number.isNaN(value) ? '' : value)

  return (
    <section
      aria-labelledby="config-heading"
      className="flex w-full flex-col rounded-lg bg-surface-container-low border border-outline-variant p-container-padding lg:flex-1"
    >
      <header className="mb-4 flex items-center gap-2">
        <Icon name="tune" className="text-primary" />
        <h2 id="config-heading" className="font-title-md text-title-md text-on-surface">
          Configuration
        </h2>
      </header>

      <div className="flex flex-col gap-4">
        <Field
          id="bind-address"
          label="Bind Address"
          hint="Fixed to loopback (127.0.0.1) — accepts connections from this machine only."
          error={errors.bindAddress}
        >
          {(describedBy) => (
            <input
              id="bind-address"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT_CLASS} read-only:cursor-not-allowed read-only:opacity-60`}
              value={config.bindAddress}
              readOnly
              disabled={disabled}
              aria-invalid={Boolean(errors.bindAddress)}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id="send-port" label="Send Port" error={errors.sendPort}>
            {(describedBy) => (
              <input
                id="send-port"
                type="number"
                min={1}
                max={65535}
                className={INPUT_CLASS}
                value={numberValue(config.sendPort)}
                disabled={disabled}
                aria-invalid={Boolean(errors.sendPort)}
                aria-describedby={describedBy}
                onChange={(event) => update('sendPort', event.target.valueAsNumber)}
              />
            )}
          </Field>

          <Field id="receive-port" label="Receive Port" error={errors.receivePort}>
            {(describedBy) => (
              <input
                id="receive-port"
                type="number"
                min={1}
                max={65535}
                className={INPUT_CLASS}
                value={numberValue(config.receivePort)}
                disabled={disabled}
                aria-invalid={Boolean(errors.receivePort)}
                aria-describedby={describedBy}
                onChange={(event) => update('receivePort', event.target.valueAsNumber)}
              />
            )}
          </Field>
        </div>

        <Field
          id="processing-delay"
          label="Processing Delay (ms)"
          hint="Time the simulated PLC waits before it replies to an inbound telegram."
          error={errors.processingDelayMs}
        >
          {(describedBy) => (
            <input
              id="processing-delay"
              type="number"
              min={0}
              max={60000}
              step={10}
              className={INPUT_CLASS}
              value={numberValue(config.processingDelayMs)}
              disabled={disabled}
              aria-invalid={Boolean(errors.processingDelayMs)}
              aria-describedby={describedBy}
              onChange={(event) => update('processingDelayMs', event.target.valueAsNumber)}
            />
          )}
        </Field>

        <label className="mt-1 flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-outline-variant bg-background text-primary focus:ring-primary disabled:opacity-50"
            checked={config.autoAcceptReconnections}
            disabled={disabled}
            onChange={(event) => update('autoAcceptReconnections', event.target.checked)}
          />
          <span className="font-body-sm text-body-sm text-on-surface">
            Auto-accept reconnections
          </span>
        </label>
      </div>
    </section>
  )
}
