import { useState, type ChangeEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DEFAULT_CONFIG } from '../features/connection/defaults'
import { loadStoredConnection, persistConnection } from '../features/connection/persistence'
import { DEFAULT_END_OF_TELEGRAM, SEED_TELEGRAM_TYPES } from '../features/telegrams/defaults'
import { loadStoredTelegrams, persistTelegrams } from '../features/telegrams/persistence'
import { parseProfile, serializeProfile, PROFILE_FILE_NAME } from './profile'

interface ConfigProfileBarProps {
  /**
   * Called after an import applies at least one section, so the app can remount
   * the active page and re-hydrate it from the freshly written stores.
   */
  onImported?: () => void
}

type StatusTone = 'success' | 'info' | 'error'

interface Status {
  tone: StatusTone
  lines: string[]
}

/** Reads a picked file's text, preferring `Blob.text()` and falling back to `FileReader`. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsText(file)
  })
}

const TONE_STYLES: Record<StatusTone, string> = {
  success: 'border-primary/40 bg-primary-container/20 text-on-surface',
  info: 'border-outline-variant bg-surface-variant/40 text-on-surface',
  error: 'border-error/40 bg-error-container/20 text-error',
}

/**
 * App-level Export / Import controls for the unified configuration profile
 * (ADR-0008). Export bundles the current connection settings and telegram
 * templates into one `plc-simulator-config.json`; Import validates a picked file
 * and writes the present sections back to their feature stores, then asks the app
 * to remount so pages re-hydrate. The canvas layout is a separate file and is not
 * part of this profile.
 */
export function ConfigProfileBar({ onImported }: ConfigProfileBarProps) {
  const [status, setStatus] = useState<Status | null>(null)

  const handleExport = () => {
    const connection = loadStoredConnection() ?? DEFAULT_CONFIG
    const stored = loadStoredTelegrams()
    const telegram = stored ?? {
      types: SEED_TELEGRAM_TYPES,
      endOfTelegram: DEFAULT_END_OF_TELEGRAM,
    }
    const json = serializeProfile({ connection, telegram })
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = PROFILE_FILE_NAME
      anchor.click()
      URL.revokeObjectURL(url)
      setStatus({ tone: 'success', lines: [`Configuration exported to ${PROFILE_FILE_NAME}.`] })
    } catch {
      setStatus({
        tone: 'info',
        lines: ['Automatic download is unavailable in this environment.'],
      })
    }
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-importing the same file
    if (!file) return

    let text: string
    try {
      text = await readFileText(file)
    } catch {
      setStatus({ tone: 'error', lines: ['Could not read the selected file.'] })
      return
    }

    const result = parseProfile(text)
    if (!result.ok) {
      setStatus({ tone: 'error', lines: result.errors })
      return
    }

    const applied: string[] = []
    if (result.sections?.connection) {
      persistConnection(result.sections.connection)
      applied.push('connection settings')
    }
    if (result.sections?.telegram) {
      persistTelegrams(result.sections.telegram.types, result.sections.telegram.endOfTelegram)
      applied.push('telegram templates')
    }

    if (applied.length > 0) {
      onImported?.()
      setStatus({
        tone: 'success',
        lines: [`Imported ${applied.join(' and ')}.`, ...result.warnings],
      })
    } else {
      setStatus({
        tone: 'info',
        lines: ['No sections were applied.', ...result.warnings],
      })
    }
  }

  const controlClass =
    'flex cursor-pointer items-center gap-2 rounded border border-outline-variant px-3 py-1.5 ' +
    'font-label-xs text-label-xs uppercase text-on-surface transition-colors hover:bg-surface-variant ' +
    'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary ' +
    'focus-within:ring-offset-2 focus-within:ring-offset-surface-container-low'

  return (
    <div className="relative flex items-center gap-2">
      <button type="button" onClick={handleExport} className={controlClass}>
        <Icon name="download" className="text-[16px]" />
        Export config
      </button>
      <label className={controlClass}>
        <Icon name="upload" className="text-[16px]" />
        Import config
        <input
          type="file"
          accept="application/json"
          aria-label="Import configuration"
          onChange={handleImportFile}
          className="sr-only"
        />
      </label>

      {status ? (
        <div
          role={status.tone === 'error' ? 'alert' : 'status'}
          className={`absolute right-0 top-full z-20 mt-2 w-80 rounded border px-3 py-2 shadow-md ${TONE_STYLES[status.tone]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <ul className="flex flex-col gap-1 font-body-sm text-body-sm">
              {status.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStatus(null)}
              aria-label="Dismiss"
              className="shrink-0 text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
