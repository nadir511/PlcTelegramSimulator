import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfigPanel } from './ConfigPanel'
import type { ConfigErrors } from './format'
import type { ListenerConfig } from './types'

const CONFIG: ListenerConfig = {
  bindAddress: '127.0.0.1',
  sendPort: 2000,
  receivePort: 2001,
  processingDelayMs: 50,
  autoAcceptReconnections: true,
}

function renderPanel(overrides?: {
  errors?: ConfigErrors
  disabled?: boolean
  onChange?: (config: ListenerConfig) => void
}) {
  const onChange = overrides?.onChange ?? vi.fn()
  render(
    <ConfigPanel
      config={CONFIG}
      errors={overrides?.errors ?? {}}
      disabled={overrides?.disabled ?? false}
      onChange={onChange}
    />,
  )
  return { onChange }
}

describe('ConfigPanel', () => {
  it('renders the bind address as a fixed, read-only loopback field', () => {
    const { onChange } = renderPanel()
    const input = screen.getByLabelText('Bind Address') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    expect(input).toHaveValue('127.0.0.1')
    fireEvent.change(input, { target: { value: '10.0.0.5' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits an updated config when the send or receive port changes', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByLabelText('Send Port'), { target: { value: '3000' } })
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, sendPort: 3000 })

    fireEvent.change(screen.getByLabelText('Receive Port'), { target: { value: '3001' } })
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, receivePort: 3001 })
  })

  it('shows validation errors and marks the field invalid', () => {
    renderPanel({ errors: { sendPort: 'Port must be between 1 and 65535' } })
    expect(screen.getByText('Port must be between 1 and 65535')).toBeInTheDocument()
    expect(screen.getByLabelText('Send Port')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders the processing-delay helper text', () => {
    renderPanel()
    expect(screen.getByText(/simulated PLC waits/i)).toBeInTheDocument()
  })

  it('disables all inputs while the listener is running', () => {
    renderPanel({ disabled: true })
    expect(screen.getByLabelText('Bind Address')).toBeDisabled()
    expect(screen.getByLabelText('Send Port')).toBeDisabled()
    expect(screen.getByLabelText('Receive Port')).toBeDisabled()
    expect(screen.getByLabelText('Processing Delay (ms)')).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
