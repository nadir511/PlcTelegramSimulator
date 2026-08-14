import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionStatusPanel } from './SessionStatusPanel'
import type { ListenerStatus, TrafficEntry } from './types'

function renderPanel(overrides?: {
  status?: ListenerStatus
  error?: string | null
  entries?: TrafficEntry[]
  canStart?: boolean
  onStart?: () => void
  onStop?: () => void
}) {
  const onStart = overrides?.onStart ?? vi.fn()
  const onStop = overrides?.onStop ?? vi.fn()
  render(
    <SessionStatusPanel
      status={overrides?.status ?? 'stopped'}
      error={overrides?.error ?? null}
      entries={overrides?.entries ?? []}
      canStart={overrides?.canStart ?? true}
      onStart={onStart}
      onStop={onStop}
    />,
  )
  return { onStart, onStop }
}

describe('SessionStatusPanel', () => {
  it('shows the start control when stopped', () => {
    const { onStart } = renderPanel({ status: 'stopped' })
    const button = screen.getByRole('button', { name: /start listener/i })
    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('disables start when the config is invalid', () => {
    renderPanel({ status: 'stopped', canStart: false })
    expect(screen.getByRole('button', { name: /start listener/i })).toBeDisabled()
  })

  it('shows the stop control while running', () => {
    const { onStop } = renderPanel({ status: 'connected' })
    fireEvent.click(screen.getByRole('button', { name: /stop listener/i }))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('surfaces an error message', () => {
    renderPanel({ status: 'error', error: 'Port 2000 already in use' })
    expect(screen.getByRole('alert')).toHaveTextContent('Port 2000 already in use')
  })

  it('reports Tx/Rx totals from the log', () => {
    const entries: TrafficEntry[] = [
      { id: 'a', timestamp: Date.now(), level: 'out', payload: [0x02] },
      { id: 'b', timestamp: Date.now(), level: 'out', payload: [0x02] },
      { id: 'c', timestamp: Date.now(), level: 'in', payload: [0x06] },
    ]
    renderPanel({ status: 'connected', entries })
    expect(screen.getByText('2 total')).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
  })
})
