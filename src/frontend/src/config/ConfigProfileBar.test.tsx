import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProfileBar } from './ConfigProfileBar'
import { APP_NAME } from './profile'
import { DEFAULT_CONFIG } from '../features/connection/defaults'
import { loadStoredConnection, persistConnection } from '../features/connection/persistence'
import { loadStoredTelegrams } from '../features/telegrams/persistence'

function makeFile(value: unknown): File {
  return new File([JSON.stringify(value)], 'plc-simulator-config.json', {
    type: 'application/json',
  })
}

/** Reads a Blob's text, falling back to FileReader where `Blob.text` is absent (jsdom). */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(blob)
  })
}

describe('ConfigProfileBar', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom may leave these undefined; ensure the spies below have a target.
    if (!('createObjectURL' in URL)) {
      ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => ''
    }
    if (!('revokeObjectURL' in URL)) {
      ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('exports the current stores as a downloadable profile', async () => {
    persistConnection({ ...DEFAULT_CONFIG, bindAddress: '9.9.9.9' })
    let captured: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ConfigProfileBar />)
    fireEvent.click(screen.getByRole('button', { name: /export config/i }))

    expect(captured).not.toBeNull()
    const parsed = JSON.parse(await readBlobText(captured as unknown as Blob))
    expect(parsed.app).toBe(APP_NAME)
    expect(parsed.connection.bindAddress).toBe('9.9.9.9')
    expect(parsed.telegramTemplates.types.length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent(/exported/i)
  })

  it('imports a profile, applies both sections, and notifies the app', async () => {
    const onImported = vi.fn()
    render(<ConfigProfileBar onImported={onImported} />)

    const file = makeFile({
      app: APP_NAME,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      connection: { ...DEFAULT_CONFIG, bindAddress: '7.7.7.7' },
      telegramTemplates: { schemaVersion: 1, endOfTelegram: '!', types: [] },
    })
    fireEvent.change(screen.getByLabelText('Import configuration'), { target: { files: [file] } })

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1))
    expect(loadStoredConnection()?.bindAddress).toBe('7.7.7.7')
    expect(loadStoredTelegrams()).toEqual({ types: [], endOfTelegram: '!' })
    expect(screen.getByRole('status')).toHaveTextContent(/imported/i)
  })

  it('shows an error and does not notify for a foreign file', async () => {
    const onImported = vi.fn()
    render(<ConfigProfileBar onImported={onImported} />)

    const file = makeFile({ app: 'SomethingElse' })
    fireEvent.change(screen.getByLabelText('Import configuration'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(new RegExp(APP_NAME, 'i'))
    expect(onImported).not.toHaveBeenCalled()
  })

  it('applies nothing and does not notify when both sections are unusable', async () => {
    persistConnection({ ...DEFAULT_CONFIG, bindAddress: '5.5.5.5' })
    const onImported = vi.fn()
    render(<ConfigProfileBar onImported={onImported} />)

    const file = makeFile({ app: APP_NAME, schemaVersion: 1, connection: null, telegramTemplates: 7 })
    fireEvent.change(screen.getByLabelText('Import configuration'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/no sections were applied/i))
    expect(onImported).not.toHaveBeenCalled()
    // Corrupt fragments left the stored connection untouched.
    expect(loadStoredConnection()?.bindAddress).toBe('5.5.5.5')
  })

  it('dismisses the status panel', async () => {
    render(<ConfigProfileBar />)
    const file = makeFile({ app: 'SomethingElse' })
    fireEvent.change(screen.getByLabelText('Import configuration'), { target: { files: [file] } })

    await waitFor(() => screen.getByRole('alert'))
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
