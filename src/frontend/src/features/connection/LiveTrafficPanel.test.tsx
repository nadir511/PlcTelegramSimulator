import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveTrafficPanel } from './LiveTrafficPanel'
import type { TrafficEntry } from './types'

const ENTRIES: TrafficEntry[] = [
  { id: 'a', timestamp: Date.now(), level: 'out', payload: [0x02, 0x41, 0x03], label: 'MP_INIT' },
  { id: 'b', timestamp: Date.now(), level: 'in', payload: [0x06], label: 'ACK' },
  { id: 'c', timestamp: Date.now(), level: 'error', message: 'Bad checksum' },
]

describe('LiveTrafficPanel', () => {
  it('renders an empty state with no entries', () => {
    render(<LiveTrafficPanel entries={[]} onClear={vi.fn()} />)
    expect(screen.getByText(/no traffic yet/i)).toBeInTheDocument()
  })

  it('renders ASCII payloads by default and switches to raw hex', () => {
    render(<LiveTrafficPanel entries={ENTRIES} onClear={vi.fn()} />)
    expect(screen.getByText('.A.')).toBeInTheDocument()
    expect(screen.queryByText('02 41 03')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Raw (hex)' }))
    expect(screen.getByText('02 41 03')).toBeInTheDocument()
    expect(screen.queryByText('.A.')).not.toBeInTheDocument()
  })

  it('shows the entry count and message rows', () => {
    render(<LiveTrafficPanel entries={ENTRIES} onClear={vi.fn()} />)
    expect(screen.getByText('3 entries')).toBeInTheDocument()
    expect(screen.getByText('Bad checksum')).toBeInTheDocument()
  })

  it('filters entries by type', () => {
    render(<LiveTrafficPanel entries={ENTRIES} onClear={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'error' } })
    expect(screen.getByText('Bad checksum')).toBeInTheDocument()
    expect(screen.queryByText('.A.')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('clears the log when requested', () => {
    const onClear = vi.fn()
    render(<LiveTrafficPanel entries={ENTRIES} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear log/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('disables clearing when the log is empty', () => {
    render(<LiveTrafficPanel entries={[]} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: /clear log/i })).toBeDisabled()
  })
})
