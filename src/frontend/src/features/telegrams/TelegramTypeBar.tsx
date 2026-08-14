import { useState } from 'react'
import { AddTelegramTypeForm } from './AddTelegramTypeForm'
import { rawStream } from './format'
import type { TelegramType } from './types'
import type { AddTypeInput, AddTypeResult } from './useTelegramTypes'
import { Icon } from '@/components/ui/Icon'

interface TelegramTypeBarProps {
  types: readonly TelegramType[]
  selectedCode: string
  onSelect: (code: string) => void
  onAddType: (input: AddTypeInput) => AddTypeResult
  onRemoveType: (code: string) => void
  /** Registry-wide End-of-Telegram terminator appended to every telegram (empty = none). */
  endOfTelegram: string
  onEndOfTelegramChange: (value: string) => void
}

/**
 * The telegram-type registry, presented in the main content area (rather than
 * the top navbar): a selectable row of type codes plus an "Add Type" action.
 */
export function TelegramTypeBar({
  types,
  selectedCode,
  onSelect,
  onAddType,
  onRemoveType,
  endOfTelegram,
  onEndOfTelegramChange,
}: TelegramTypeBarProps) {
  const [adding, setAdding] = useState(false)
  const eotHex = rawStream([], endOfTelegram)

  return (
    <section
      aria-labelledby="type-registry-heading"
      className="rounded-lg bg-surface-container-low border border-outline-variant p-container-padding"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="swap_horiz" className="text-primary" />
          <h2 id="type-registry-heading" className="font-title-md text-title-md text-on-surface">
            Telegram Type Registry
          </h2>
          <span className="font-label-xs text-label-xs text-on-surface-variant tabular-nums">
            {types.length} {types.length === 1 ? 'type' : 'types'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="end-of-telegram"
              title="Special character appended to every telegram's byte form (e.g. # or !). Leave empty for none."
              className="flex items-center gap-1.5 font-label-xs text-label-xs uppercase text-on-surface-variant"
            >
              EOT
            </label>
            <input
              id="end-of-telegram"
              type="text"
              value={endOfTelegram}
              maxLength={4}
              spellCheck={false}
              autoComplete="off"
              placeholder="#"
              aria-label="End of Telegram character"
              onChange={(event) => onEndOfTelegramChange(event.target.value)}
              className="w-14 rounded border border-outline-variant bg-background px-2 py-1 text-center font-data-mono text-data-mono text-on-surface focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
            <span
              aria-label="End of Telegram bytes"
              title="terminator byte(s), appended to the telegram"
              className="min-w-[2.5rem] font-data-mono text-label-xs text-on-surface-variant tabular-nums"
            >
              {eotHex || '—'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            aria-expanded={adding}
            className="flex items-center gap-1 rounded border border-outline-variant px-3 py-1.5 font-label-xs text-label-xs uppercase text-secondary transition-colors hover:border-secondary hover:text-secondary-fixed"
          >
            <Icon name="add" />
            Add Type
          </button>
        </div>
      </div>

      <div role="group" aria-label="Telegram types" className="mt-3 flex flex-wrap gap-2">
        {types.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant/70">
            No telegram types yet — add one to start building.
          </p>
        ) : (
          types.map((type) => {
            const selected = type.code === selectedCode
            return (
              <div
                key={type.code}
                className={`flex items-center gap-1 rounded border pr-1 transition-colors ${
                  selected
                    ? 'border-secondary bg-surface-container-high'
                    : 'border-outline-variant hover:border-secondary/60'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  title={type.name}
                  onClick={() => onSelect(type.code)}
                  className={`flex items-baseline gap-2 rounded-l px-3 py-2 transition-colors ${
                    selected ? 'text-secondary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="font-headline-md text-headline-md leading-none">{type.code}</span>
                  <span className="font-label-xs text-label-xs text-on-surface-variant">{type.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${type.code} telegram type`}
                  title={`Delete ${type.name}`}
                  onClick={() => onRemoveType(type.code)}
                  className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-error"
                >
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {adding ? (
        <AddTelegramTypeForm onAdd={onAddType} onClose={() => setAdding(false)} />
      ) : null}
    </section>
  )
}
