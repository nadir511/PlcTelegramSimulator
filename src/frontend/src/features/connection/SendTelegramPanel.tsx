import { useMemo, useState } from 'react'
import { formatAscii, formatHex, parseAscii, parseHex } from './format'
import { Icon } from '@/components/ui/Icon'

type InputMode = 'hex' | 'ascii'

interface SendTelegramPanelProps {
  /** Only a connected session can receive a manual telegram. */
  connected: boolean
  onSend: (payload: readonly number[]) => void
}

interface ModeToggleProps {
  mode: InputMode
  onChange: (mode: InputMode) => void
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const options: ReadonlyArray<{ value: InputMode; label: string }> = [
    { value: 'ascii', label: 'ASCII' },
    { value: 'hex', label: 'Hex' },
  ]
  return (
    <div role="group" aria-label="Input format" className="flex rounded border border-outline-variant p-0.5">
      {options.map((option) => {
        const selected = option.value === mode
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded px-2.5 py-1 font-label-xs text-label-xs transition-colors ${
              selected ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Right column: compose a telegram (hex or ASCII) and send it to the peer. */
export function SendTelegramPanel({ connected, onSend }: SendTelegramPanelProps) {
  const [mode, setMode] = useState<InputMode>('ascii')
  const [text, setText] = useState('')

  const bytes = useMemo(() => (mode === 'hex' ? parseHex(text) : parseAscii(text)), [mode, text])
  const isValid = bytes !== null
  const isEmpty = bytes !== null && bytes.length === 0
  const canSend = connected && isValid && !isEmpty

  const changeMode = (next: InputMode): void => {
    if (next === mode) return
    // Reformat the current payload into the new representation when it parses.
    if (bytes !== null) {
      setText(next === 'hex' ? formatHex(bytes) : formatAscii(bytes))
    }
    setMode(next)
  }

  const handleSend = (): void => {
    if (!canSend || bytes === null) return
    onSend(bytes)
  }

  const placeholder = mode === 'hex' ? '02 4D 50 30 31 03' : 'MP01'
  const previewId = 'telegram-preview'

  return (
    <section
      aria-labelledby="send-heading"
      className="flex w-full flex-col rounded-lg bg-surface-container-low border border-outline-variant p-container-padding lg:flex-1"
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="send" className="text-primary" />
          <h2 id="send-heading" className="font-title-md text-title-md text-on-surface">
            Send Telegram
          </h2>
        </div>
        <ModeToggle mode={mode} onChange={changeMode} />
      </header>

      <div className="flex flex-1 flex-col gap-3">
        <label htmlFor="telegram-input" className="font-label-xs text-label-xs uppercase text-on-surface-variant">
          Payload ({mode === 'hex' ? 'hex bytes' : 'ASCII text'})
        </label>
        <textarea
          id="telegram-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!isValid}
          aria-describedby={previewId}
          className="min-h-[96px] flex-1 resize-none rounded bg-background border border-outline-variant px-3 py-2 font-data-mono text-data-mono text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary aria-[invalid=true]:border-error"
        />

        <p id={previewId} className="font-label-xs text-label-xs">
          {!isValid ? (
            <span role="alert" className="text-error">
              {mode === 'hex' ? 'Invalid hex — use byte pairs like 02 4D 03.' : 'ASCII must be single-byte characters.'}
            </span>
          ) : isEmpty ? (
            <span className="text-on-surface-variant/70">Enter a payload to send.</span>
          ) : (
            <span className="text-on-surface-variant tabular-nums">
              {bytes.length} {bytes.length === 1 ? 'byte' : 'bytes'} · {formatHex(bytes)}
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex items-center justify-center gap-2 rounded bg-secondary px-4 py-2.5 font-title-md text-title-md text-on-secondary transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 focus:ring-offset-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="send" filled />
          Send
        </button>

        {!connected ? (
          <p className="text-center font-label-xs text-label-xs text-on-surface-variant/70">
            Connect a client to send telegrams.
          </p>
        ) : null}
      </div>
    </section>
  )
}
