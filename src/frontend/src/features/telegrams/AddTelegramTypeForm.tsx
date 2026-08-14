import { useState } from 'react'
import type { AddTypeInput, AddTypeResult } from './useTelegramTypes'
import { Icon } from '@/components/ui/Icon'

interface AddTelegramTypeFormProps {
  onAdd: (input: AddTypeInput) => AddTypeResult
  onClose: () => void
}

const INPUT_CLASS =
  'w-full rounded bg-background border border-outline-variant px-3 py-2 font-data-mono text-data-mono text-on-surface ' +
  'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary aria-[invalid=true]:border-error'

/** Inline form for registering a new telegram type (code + name). */
export function AddTelegramTypeForm({ onAdd, onClose }: AddTelegramTypeFormProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const result = onAdd({ code, name })
    if (result.ok) {
      onClose()
      return
    }
    setError(result.error ?? 'Could not add telegram type')
  }

  const errorId = error ? 'add-type-error' : undefined

  return (
    <form
      onSubmit={submit}
      aria-label="Add telegram type"
      className="mt-3 flex flex-wrap items-end gap-3 rounded border border-outline-variant bg-surface-container p-3"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-type-code" className="font-label-xs text-label-xs uppercase text-on-surface-variant">
          Code
        </label>
        <input
          id="new-type-code"
          autoFocus
          value={code}
          maxLength={4}
          spellCheck={false}
          autoComplete="off"
          placeholder="SR"
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            setError(null)
          }}
          className={`${INPUT_CLASS} w-24 uppercase`}
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="new-type-name" className="font-label-xs text-label-xs uppercase text-on-surface-variant">
          Name
        </label>
        <input
          id="new-type-name"
          value={name}
          spellCheck={false}
          autoComplete="off"
          placeholder="Sensor Reset"
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
          className={`${INPUT_CLASS} min-w-[12rem]`}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="flex items-center gap-1 rounded bg-primary px-3 py-2 font-label-xs text-label-xs uppercase text-on-primary transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface-container"
        >
          <Icon name="check" filled />
          Create
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-outline-variant px-3 py-2 font-label-xs text-label-xs uppercase text-on-surface-variant transition-colors hover:text-on-surface"
        >
          Cancel
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="w-full font-label-xs text-label-xs text-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}
