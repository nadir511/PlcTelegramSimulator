import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectionPage } from './ConnectionPage'
import { DEFAULT_CONFIG } from './defaults'
import type {
  ConnectionClient,
  ConnectionEvent,
  ConnectionSnapshot,
} from './connectionClient'
import type { ListenerConfig, ListenerStatus } from './types'

/** Deterministic, timer-free client the test drives by hand. */
class FakeConnectionClient implements ConnectionClient {
  private status: ListenerStatus = 'stopped'
  private error: string | null = null
  private readonly listeners = new Set<(event: ConnectionEvent) => void>()

  readonly startCalls: ListenerConfig[] = []
  stopCalls = 0

  getSnapshot(): ConnectionSnapshot {
    return { status: this.status, error: this.error }
  }

  start(config: ListenerConfig): Promise<void> {
    this.startCalls.push(config)
    return Promise.resolve()
  }

  stop(): Promise<void> {
    this.stopCalls += 1
    return Promise.resolve()
  }

  readonly sentPayloads: number[][] = []

  send(payload: readonly number[]): Promise<void> {
    this.sentPayloads.push([...payload])
    return Promise.resolve()
  }

  subscribe(listener: (event: ConnectionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: ConnectionEvent): void {
    if (event.type === 'status') {
      this.status = event.status
      this.error = event.error ?? null
    }
    act(() => {
      for (const listener of this.listeners) listener(event)
    })
  }
}

describe('ConnectionPage', () => {
  it('starts the listener with the default config', () => {
    const client = new FakeConnectionClient()
    render(<ConnectionPage client={client} />)

    expect(screen.getByText(/no traffic yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /start listener/i }))

    expect(client.startCalls).toHaveLength(1)
    expect(client.startCalls[0]).toEqual(DEFAULT_CONFIG)
  })

  it('reflects status changes and locks the config while running', () => {
    const client = new FakeConnectionClient()
    render(<ConnectionPage client={client} />)

    expect(screen.getByLabelText('Bind Address')).not.toBeDisabled()

    client.emit({ type: 'status', status: 'connected' })

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByLabelText('Bind Address')).toBeDisabled()
    expect(screen.getByRole('button', { name: /stop listener/i })).toBeInTheDocument()
  })

  it('appends emitted traffic to the log', () => {
    const client = new FakeConnectionClient()
    render(<ConnectionPage client={client} />)

    client.emit({
      type: 'traffic',
      entry: { id: 'e1', timestamp: Date.now(), level: 'out', payload: [0x02, 0x41, 0x03], label: 'MP_INIT' },
    })

    expect(screen.getByText('.A.')).toBeInTheDocument()
    expect(screen.getByText('1 entry')).toBeInTheDocument()
  })

  it('stops the listener when requested', () => {
    const client = new FakeConnectionClient()
    render(<ConnectionPage client={client} />)

    client.emit({ type: 'status', status: 'connected' })
    fireEvent.click(screen.getByRole('button', { name: /stop listener/i }))

    expect(client.stopCalls).toBe(1)
  })

  it('blocks starting when the config is invalid', () => {
    const client = new FakeConnectionClient()
    render(<ConnectionPage client={client} />)

    fireEvent.change(screen.getByLabelText('Send Port'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: /start listener/i })).toBeDisabled()
  })

  it('sends a manual telegram to the connected peer', () => {
    const client = new FakeConnectionClient()
    render(<ConnectionPage client={client} />)

    client.emit({ type: 'status', status: 'connected' })
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }))
    fireEvent.change(screen.getByRole('textbox', { name: /payload/i }), {
      target: { value: '01 02' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))

    expect(client.sentPayloads).toEqual([[1, 2]])
  })
})
